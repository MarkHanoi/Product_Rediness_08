# LOD-200 Context-Building Rate — Norway (`no`) national

**Headline: LOD 1 · real-height coverage ~85% · ESTIMATED (FKB licence-gated commercial)**

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
| Germany | LOD 2 | ~90% | ~82% | VERIFIED (NRW) |
| France | LOD 1→2 | ~88% | ~80% | VERIFIED |
| **Norway** | **LOD 1** | **~85%** | **~72%** | **ESTIMATED** |
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
| **(a) Parcel definition** | Matrikkelen (national cadastre), free WFS via Geonorge | ~96% | ESTIMATED | parcel geometry is open |
| **(b) Real building HEIGHT** | **FKB-Bygning** (footprint + top-height, 2.5D) — **licence-gated commercial**; or **NDH** national LiDAR nDSM (free) as the open substitute | ~85% | ESTIMATED | height exists nationally; FKB commercial licence is the gate, NDH is the free path |
| **(c) Extra attributes** | Matrikkelen building type; no roof form (FKB is 2.5D, not true LoD2) | **MED** | ESTIMATED | Kulturminnesøk heritage overlay open |

**OSM height-tag floor:** ESTIMATED ~5–15% explicit-height. Free open substitute for height without
FKB = **Matrikkelen Bygningspunkt (building point, free) + NDH DSM−DTM nDSM** — coarser than FKB but
no licence step.

---

## Data strategy — footprint (2D) vs height (3D)

⚠ 2D footprint accuracy and 3D height accuracy are DIFFERENT numbers — never blend them. Binding
metric = the 3D number. (Global strategy: Overture-primary + MS density-fallback + country-premium
adapters + a height confidence hierarchy — see LOD-RATE-MASTER.)

| Axis | Decision | Accuracy | Flag |
|---|---|---|---|
| **Footprint (2D)** | Kartverket Matrikkelen (free) + Overture/MS; premium FKB footprint is licence-gated | **~90%** | ESTIMATED |
| **Height (3D)** | conf tier **2** — NDH LiDAR nDSM (free, no licence). FKB surveyed top-height (tier 1) is commercial-licensed | **~72–85%** | ESTIMATED (research complete; no per-parcel live probe) |

**Building-TYPE:** Norwegian fabric ★★★. The 3D headline drag is the FKB commercial licence, not
type accuracy — the reachable-free height is the coarser NDH-derived value. No national LoD2.

## The structural finding

**Norway has strong national building + terrain data, but the building HEIGHT is behind a commercial
licence gate — the single most-missed cost in a Norway integration.** FKB-Bygning provides parcel
footprint + a top-height value per building (2.5D LoD1), but it is **free only for "Norge digitalt"
parties** (public bodies + Geovekst holders); a commercial engine must buy it via a reseller
(Geodata, Norkart) or negotiate a direct Kartverket agreement. Parcel geometry, NDH terrain LiDAR,
and heritage data are all genuinely free — which creates the trap of assuming FKB is too.

The **free workaround** keeps Norway at a real LoD1: Matrikkelen Bygningspunkt (one open point per
building) + NDH (complete national LiDAR, ≥2 pts/m², 2016–2022, free no-login) → estimate per-building
height from DSM−DTM. This is coarser than FKB's surveyed top-height but needs no licence. There is
**no true LoD2** anywhere in Norway's national stack (FKB is 2.5D, no roof geometry) — same limitation
as Germany's LoD2-DE roofs derive from LiDAR, but Norway lacks even the CityGML roof product.

The ~72% headline (below the ~85% height coverage) reflects the licence drag: the *reachable-without-
purchase* height is the coarser NDH-derived path, not the surveyed FKB top-height.

---

## Orthogonality with RATE.md

Norway's `RATE.md` is ~32% (zone code in a 357-kommune-fragmented planregister; FAR often in PDF).
Its context rate ~72% is higher — Norway's physical-data infrastructure (Matrikkelen + NDH) outruns
its zoning-number digitisation, but both are dragged by the same fragmentation/licence posture. The
two numbers are independent: ~32% is the rules, ~72% is the physical model.

---

## What would raise the LOD level

| Action | LOD / height impact | Effort |
|---|---|---|
| Wire the free path: Matrikkelen Bygningspunkt + NDH nDSM | LOD 100 → **LOD 150** (coarse) nationally, no licence | MED — LiDAR nDSM processing |
| Resolve the FKB-Bygning commercial licence (reseller or Kartverket) | LOD 150 with surveyed top-height (tighter) | MED — licence/cost, not code |
| No national LoD2 to wire — roof form would need self-run LiDAR reconstruction | LOD 150 → LOD 200 (reconstructed, badge non-official) | HIGH |

---

## Appendix — live-probe evidence

| Endpoint | Probed | Result | Verdict |
|---|---|---|---|
| Geonorge WFS (Matrikkelen / FKB) · `hoydedata.no` NDH | — | NOT probed this pass; national sources characterised in `topics/buildings-lod-height.md` (RESEARCH COMPLETE) | ESTIMATED |

---

*Last updated: 2026-07-24. Sources characterised (RESEARCH COMPLETE) but no live per-parcel probe.
FKB-Bygning height is licence-gated for commercial use; free path = Matrikkelen point + NDH nDSM. No
national LoD2. Maintainer: UNASSIGNED.*
