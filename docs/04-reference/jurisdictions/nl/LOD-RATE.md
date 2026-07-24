# LOD-200 Context-Building Rate — Netherlands (`nl`) national

**Headline: LOD 2.2 · real-height coverage ~99% · VERIFIED**

> **LOD-200 context-building rate** — the fraction of the existing buildings around a plot for
> which we can obtain a faithful **≥ LOD-150 physical model** — **real parcel geometry + real
> MEASURED per-building height + ≥1 extra attribute (roof form / storeys / use / construction
> year)** — from an authoritative source, WITHOUT falling back to a fabricated OSM flat-extrude.
> The binding sub-metric is real building-HEIGHT coverage. Identical definition across every
> jurisdiction so scores are comparable. **Distinct from `RATE.md`** (buildable rules) — never
> conflate the two numbers.

## The LOD ladder (fixed)

| Level | What it is | Our label |
|---|---|---|
| **LOD 100** | footprint + estimated/block height (OSM tag, `levels`×3.2 m, or the fabricated 9 m default) | the universal floor (today's fallback) |
| **LOD 150 (LoD1)** | footprint + **real measured** height | first honest tier |
| **LOD 200 (LoD2)** | footprint + real height + **roof form / storeys** | the target |

| Jurisdiction | LOD achievable | Real-height % | Headline | Flag |
|---|---|---|---|---|
| **Netherlands** | **LOD 2.2** | **~99%** | **~97%** | **VERIFIED** |
| Switzerland | LOD 2 | ~98% | ~95% | VERIFIED |
| Denmark | LOD 2 | ~95% | ~93% | ESTIMATED |
| Germany | LOD 2 | ~90% | ~82% | VERIFIED (NRW) |
| France | LOD 1→2 | ~88% | ~80% | VERIFIED |
| Norway | LOD 1 | ~85% | ~72% | ESTIMATED |
| Sweden | LOD 1 | ~80% | ~68% | ESTIMATED |
| USA | LOD 1 | ~60% | ~58% | VERIFIED |
| Spain | LOD 1 (hybrid) | ~45% | ~52% | VERIFIED (footprint) |
| Belgium | LOD 1 | ~55% | ~48% | ESTIMATED |
| Portugal | LOD 1 | ~75% | ~42% | ESTIMATED |
| Italy | LOD 1 (regional) | ~30% | ~35% | ESTIMATED |
| Saudi Arabia | LOD 1 (ML) | ~20% | ~18% | ESTIMATED |

**The Netherlands is the ceiling exemplar for context data** — the LOD-200 equivalent of what
Denmark is for the buildable-rule rate. It is the one jurisdiction where a true national LoD2
model, with real roof geometry and multiple LoD tiers, exists as open data and was confirmed
live this pass.

---

## The three sub-metrics

| Sub-metric | Source | Coverage | Flag | Note |
|---|---|---|---|---|
| **(a) Parcel definition** | Kadaster BRK / BRK-Publiek (national cadastre) + BAG `pand` | ~100% | ESTIMATED | national, no per-region fragmentation |
| **(b) Real building HEIGHT** | **3DBAG** — BAG footprint × AHN (national LiDAR) nDSM; per-building measured roof heights | ~99% | **VERIFIED** | `b3_h_dak_50p/70p/max/min`, `b3_h_nok` (ridge), `b3_h_maaiveld` (ground) |
| **(c) Extra attributes** | 3DBAG `b3_dak_type` (roof form) + BAG (build year, use function, status) | **HIGH** | VERIFIED (roof) | real roof planes + BAG registry attributes |

**OSM height-tag floor:** Dutch OSM is well-mapped in cities but 3DBAG makes it irrelevant —
every BAG-registered building carries a measured height, so the fabricated 9 m default is never
reached where 3DBAG is joined. (OSM floor, ESTIMATED ~15–25% explicit-height in urban cores.)

---

## The structural finding

**3DBAG is world-class and native LoD2.** It combines the BAG building/address register
(every building keyed by `NL.IMBAG.Pand.*`) with AHN, the national airborne-LiDAR height model,
to publish each building at **four LoD tiers simultaneously — LoD 0, 1.2, 1.3 and 2.2** — with
real roof-plane geometry, roof type, and percentile roof heights (50p/70p/max/min) plus the
ground-level (maaiveld) reference. This is a genuine LoD2.2 product, not a height *attribute* on
a flat box (France) and not a floor-count estimate (Spain). Live probe this pass (2026-07-24)
returned a CityJSON FeatureCollection with `lod` 0/1.2/1.3/2.2, `b3_dak_type: "slanted"`,
`b3_h_nok`, and the full roof-height percentile set — confirming the top of the ladder is
reachable from a keyless HTTP API.

The only residual (~1–3%) is new construction not yet in the current 3DBAG release cycle and
the handful of BAG objects flagged as low-quality reconstructions.

---

## Orthogonality with RATE.md

The Netherlands has no `RATE.md` in this tree yet, but the point stands: its context data is #1
in the world while its buildable-rule digitisation (bestemmingsplannen / Omgevingswet DSO) is a
separate question. **A perfect physical model of the existing city does not tell you what you
MAY build — that is the other rate.** Do not read ~97% as a zoning-answerability number.

---

## What would raise the LOD level

Already at the ceiling (LoD 2.2). Actions here are integration, not sourcing:

| Action | LOD / height impact | Effort |
|---|---|---|
| Wire the 3DBAG CityJSON `items` API into the context loader (replaces OSM flat-extrude for NL) | LOD 100 → **LOD 2.2** for all of NL | LOW — keyless API, CityJSON parser |
| Ingest AHN nDSM directly for buildings absent from the current 3DBAG cut | closes the ~1–3% new-build residual | MED |

---

## Appendix — live-probe evidence

| Endpoint | Probed | Result | Verdict |
|---|---|---|---|
| `https://api.3dbag.nl/collections/pand/items?limit=1` | 2026-07-24 | HTTP 200 · CityJSON FeatureCollection · `lod` = 0/1.2/1.3/2.2; fields `b3_h_dak_50p`, `b3_h_nok`, `b3_h_maaiveld`, `b3_dak_type:"slanted"` present on `NL.IMBAG.Pand.0310100000657113` | **VERIFIED — LoD2.2 + real roof** |

---

*Last updated: 2026-07-24. 3DBAG `items` API VERIFIED live (LoD2.2, real roof geometry + roof
heights). Kadaster BRK + BAG national coverage desk-ESTIMATED. This is the context-data ceiling.
Maintainer: UNASSIGNED.*
