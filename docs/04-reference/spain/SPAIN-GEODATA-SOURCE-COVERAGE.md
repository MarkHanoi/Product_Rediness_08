# L-584 — Spain geodata source coverage: what we use, what exists, what we are missing

**Raised:** 2026-07-22, from the founder's call with the **Cityweft** CEO + three screenshots of
their layer picker. **Status: ANALYSIS + VERIFICATION BACKLOG. Nothing here is measured yet.**

⚠ **CONFIDENCE WARNING, READ FIRST.** Everything in §3 is written from model knowledge, **not from a
live probe**. Under C58 §1.4 that makes it a **hypothesis list, not a source list**. This document's
real output is **§6, the verification backlog**. Do not encode, cite, or promise any source below
until it has been fetched and its licence read. We have already been burned exactly here: L-467 (a
server cached an empty success for 24 h), L-469 (Overpass reporting errors in-band as HTTP 200), and
L-513 (a "free public API" that was an unfixable hot-path). **A source that exists in my memory is
not a source.**

---

## 1 · WHAT CITYWEFT'S UI ACTUALLY REVEALS

Their **Buildings** layer picker offers, as separate selectable options:

```
OSM buildings
OSM + Spain LiDAR
OSM buildings (+ Microsoft ML Buildings heights)
Instituto Geográfico Nacional (España)
Instituto Geográfico Nacional (España) + Spain LiDAR
Microsoft ML Buildings
Microsoft ML Buildings + Spain LiDAR
```

plus `SURFACE: Geometric | Raster Map | Satellite`, `TREES: Basic | Precise`, and a `Sunlight`
toggle.

### ⇒ THE ARCHITECTURAL POINT, WHICH IS WORTH MORE THAN THE SOURCE LIST

**They treat FOOTPRINT and HEIGHT as two independently-sourced layers, and let the user compose
them.** Every entry above is a *pairing*: `<footprint source> + <height source>`. Three footprint
providers × two height providers, offered as a matrix.

**We do not have that separation.** Our context pipeline has exactly one footprint source (OSM, via
the baked tiles) and derives height from tags on those same features — so footprint provenance and
height provenance are welded together. `heightProvenance` (L-582) already distinguishes *how good* a
height is; it cannot express *a different source for the height than for the shape*.

⚠ This is the same shape of defect as L-582 itself: **0.9% of our context buildings carry a surveyed
`height` tag; 79.3% are `building:levels` × our assumed 3.2 m; 19.8% are a fabricated 9 m.** A LiDAR
height layer would replace **all three** with a measurement — and the reason we have not done it is
that we never modelled height as separable from footprint.

⚠ **AND IT IS NOT COSMETIC.** L-527 (the Gòtic envelope "looks flat") was root-caused to context
neighbour heights and explicitly parked pending **an nDSM we did not have**. If Spain LiDAR is real
and usable, **L-527's blocker is removed and so is 12b's** (Arts. 319/320 set nucli antic height from
the *average of existing neighbouring buildings* — a rule we refuse to encode today precisely because
averaging 79% estimates and 20% fabrications into a **legal** height would be fabrication wearing the
costume of a construction).

---

## 2 · ⚠⚠ THE GAP NOBODY HAS NAMED YET — WE HAVE NO TERRAIN, AND IT IS A LEGAL PROBLEM

Cityweft ships a terrain surface. **We assume the ground is FLAT.** Barcelona is not flat: Montjuïc,
the Gòtic slope, Vallcarca, Putxet, Ciutadella's fall to the sea.

Everyone treats "no DTM" as a *visual* shortcoming. **On this product it is a CORRECTNESS one**, and
it may be the most important thing on this page:

> **PGM heights are measured from a REFERENCE LEVEL (the *rasant*), not from an arbitrary zero.** The
> *alçada reguladora màxima* is measured at the façade, from the pavement rasant, and the ordinances
> carry explicit machinery for what to do when a street SLOPES — a frontage is broken into segments
> and each takes its own reference point.

We currently place the envelope on a flat plane at elevation 0 and extrude the Art. 327 height from
it. **On any sloping street that is the wrong height at one or both ends of the façade, and the error
is the street's fall across the parcel — metres in the Gòtic, not centimetres.**

⚠ So terrain is not "phase 2 polish". **It is an input to a legal calculation we are already
publishing.** Until it is resolved, our height answer carries an unstated flat-ground assumption
that the ordinance itself does not make. Treat this as a **P1 correctness item**, and note that we
have not yet measured how wrong it is — that measurement is task V6 below.

---

## 3 · CANDIDATE SOURCE LIST — ⚠ HYPOTHESES, ALL UNVERIFIED

| # | Source | Believed to give | Believed licence | Confidence |
|---|---|---|---|---|
| S1 | **PNOA LiDAR** (IGN/CNIG) — "Spain LiDAR" | classified national point cloud; nDSM ⇒ **building heights**, vegetation | open, attribution | **believed-high** |
| S2 | **IGN MDT** (MDT05/MDT02 …) | **DTM** — bare-earth terrain raster | open, attribution | **believed-high** |
| S3 | **IGN MDS** | **DSM** — surface incl. buildings/canopy | open, attribution | believed-medium |
| S4 | **ICGC** (Institut Cartogràfic i Geològic de **Catalunya**) | Catalonia LiDAR/DTM/ortho, often finer than national | open, attribution | **believed-high** |
| S5 | **Microsoft GlobalMLBuildingFootprints** | ML footprints, some with heights | ODbL | believed-medium |
| S6 | **Overture Maps** buildings | fused footprints + height attributes | open | believed-medium |
| S7 | **IGN BTN / BCN** topographic | authoritative footprints, roads | open, attribution | believed-medium |
| S8 | **Barcelona open data — *arbrat viari*** | street trees w/ species+position ⇒ "Precise Trees" | open | believed-medium |
| S9 | **Copernicus** (Urban Atlas, Tree Cover Density, EU-DEM) | land cover, canopy, coarse DEM | open | believed-medium |
| S10 | **PNOA orthophoto** | the satellite/raster surface option | open, attribution | **believed-high** |

**Already in production:** Catastro INSPIRE WFS (parcels), MUC (clau), OSM via our own bake
(context), Cesium photoreal + OpenFreeMap (basemap). See `BARCELONA-DATA-PIPELINE.md`.

⚠ **Do not read the table as a plan.** Several entries are plausible-sounding and would be easy to
half-remember wrongly — resolutions, coverage years, and above all **licence terms** must come from
the provider, and a licence that forbids derived commercial redistribution changes the answer
entirely for a SaaS.

---

## 4 · WHAT THIS WOULD UNBLOCK, IN VALUE ORDER

| Unblocks | Today | Needs |
|---|---|---|
| **L-527** context heights ("Gòtic looks flat") | 0.9% surveyed | S1 nDSM |
| **12b rule pack** (~1.8% coverage) | **REFUSED** — no surveyed neighbour heights | S1 nDSM |
| **§2 terrain / rasant correctness** | flat-ground assumed **silently** | S2/S4 DTM |
| Solar + shadow realism (`@pryzm/solar-analysis`) | flat ground, estimated neighbours | S1 + S2 |
| Footprint completeness | OSM-only | S5/S6/S7 |
| Trees / entourage | none | S8 + S1 |

⚠ **These do NOT move the six-layer end-to-end number (5.8%).** That is gated by **L-581** (depth
geometry) and by rule-pack coverage. Terrain and LiDAR make the answer *correct on sloping ground*
and the scene *honest*; they do not make more parcels resolvable. **Do not let a shiny data layer
reorder the queue** — L-581 remains the single highest-value item at 5.8% → ~20.4%.

---

## 5 · THE COMPETITIVE READ (state it plainly)

Cityweft is doing **city-scale context capture** — footprints × heights × terrain × trees, exported
to a modelling tool. That is the layer we call *context*, and **they are ahead of us on it**.

We are doing something they are not: **the buildable envelope from the ordinance** — a derived legal
answer per parcel, with refusals and confidence tiers. Their layer list contains **no zoning, no
FAR, no depth, no height rule**.

⇒ **Context is a commodity input we should ACQUIRE, not out-build.** The defensible asset is the
rule packs and the honesty machinery (`BARCELONA-DATA-PIPELINE.md`: *"six of seven layers are free;
the seventh is the whole cost"*). ⚠ The corollary is uncomfortable and should be said: **a
context-capture product can add zoning far more easily than we can add city-scale capture.** Our
moat is depth of legal correctness per municipality, not breadth of geodata — which argues for
finishing Barcelona to a defensible standard before widening.

---

## 6 · ⇒ THE VERIFICATION BACKLOG — THE ACTUAL DELIVERABLE OF THIS DOCUMENT

Do these **before** any encoding, in this order. Each is a probe, and each must record what it
**could not** see.

- **V1 — PNOA LiDAR reachability.** Can a server-side job fetch a tile for a Barcelona bbox
  unattended? Record HTTP status **and body content-type** — remember the SPA-fallback trap
  (a `206` carrying `text/html` looked like a working byte-range read).
- **V2 — ⚠ LICENCE, in writing, for S1/S2/S4.** Specifically: may a **derived product** (an nDSM,
  or heights baked into our tiles) be **redistributed commercially**? This can veto the whole plan
  and therefore goes before any pipeline work.
- **V3 — nDSM accuracy probe.** Derive heights for a Barcelona sample, compare against the **0.9%
  of OSM buildings that carry a surveyed `height`**. That is a small but genuinely independent
  ground truth — the [[probe-can-be-wrong-three-ways]] rule: an independent source, not a
  self-comparison.
- **V4 — volume/cost.** Point-cloud tiles for Barcelona: GB, and processing time. Compare to the
  context bake (Geofabrik Cataluña 266 MB → 13.4 MB of tiles).
- **V5 — ICGC vs PNOA for Catalonia.** Resolution, recency, licence. Regional may beat national —
  but note it would **not** transfer outside Catalonia, unlike S1/S2.
- **V6 — ⚠ MEASURE THE FLAT-GROUND ERROR (§2).** For a sample of Barcelona parcels, what is the
  terrain fall **across the parcel frontage**? That single number decides whether §2 is a P1
  correctness defect or a rounding error, and it can be answered from a DTM alone — **no LiDAR, no
  licence, no pipeline.** **Cheapest high-information probe on this page. Do it first.**
- **V7 — the *rasant* rule itself.** Confirm from the PGM/ordinances how the reference level is
  fixed on a sloping frontage (segmentation rules, mid-point conventions). ⚠ **A DTM without the
  rule is not enough** — knowing the ground shape does not tell us which point the ordinance
  measures from, and guessing would be a C58 §1.11 wrong-SHAPE error.

---

## 7 · ARCHITECTURAL NOTE FOR WHOEVER TAKES THIS

If S1 verifies, the change is **not** "add a LiDAR layer". It is:

1. **Split footprint provenance from height provenance** in the context feature model, so a feature
   can carry an OSM shape and a LiDAR height with two separate confidence tiers (extends L-582's
   `heightProvenance`; C23 provenance, C58 §1.2).
2. **Bake the nDSM height into the existing PMTiles** as a per-feature attribute — reuse
   `tools/context-bake/`, do NOT add a second runtime fetch path. **L-513 is the standing lesson:
   live third-party geodata on the hot path is not fixable by making it faster.**
3. **Terrain is a separate decision** with its own contract implications (C19 site frame): it moves
   the site's base plane, so it touches the envelope, solar, and every elevation in the scene. It
   should get an ADR before code.

**Cross-refs:** L-513/L-513b (why context is baked, not live), L-527 (flat Gòtic envelope), L-582
(height provenance), L-583 §5 (12b needs surveyed heights), ADR-0271, C19, C23, C58,
`BARCELONA-DATA-PIPELINE.md`.
