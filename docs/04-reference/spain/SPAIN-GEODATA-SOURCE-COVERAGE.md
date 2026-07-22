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

---

## ⚠⚠ CORRECTION, SAME DAY (2026-07-22) — "WE HAVE NO TERRAIN" WAS **WRONG**. READ THIS OVER §2.

I wrote §2 below from an assumption and did not check the code first. **The code disagrees with it,
so §2 is the thing that is wrong** — and the corrected defect is *narrower, more precise, and far
cheaper to fix.* Left in place rather than deleted, because the retraction is the useful part.

**WHAT WE ACTUALLY HAVE.** `CesiumViewport.clampTerrainThenReplace()` calls
`Cesium.sampleTerrainMostDetailed()` and **seats the massing on real sampled ground**. Cesium World
Terrain is live in production (`VITE_CESIUM_TOKEN` is a repo secret, baked at build time). So we are
**not** hard-pinned to elevation 0, and we do **not** need to acquire a DTM to know the ground height.

**THE ACTUAL DEFECT, RESTATED — IT SURVIVES, IN A SHARPER FORM.** We take **ONE sample, at the
boundary centroid**, and seat the entire massing at that single elevation:

> **The envelope is a FLAT SLAB placed at the CENTROID's elevation.**

The Art. 327 height is then extruded from that one datum. But **the ordinance measures from the
*rasant* AT THE FAÇADE** — and on a sloping street the façade rasant differs from the centroid, *and
differs along the façade's own length*. So on sloping ground the published height is wrong by
**(centroid elevation − façade rasant)**, which is the fall from the middle of the block to its
street edge. Still metres in the Gòtic, still unstated. **Two independent errors, not one:**

1. **wrong DATUM** — centroid instead of the façade line;
2. **NO SEGMENTATION** — one datum for a whole frontage the ordinance may require broken into
   segments, each with its own reference.

**⚠ AND A THIRD, WHICH IS THE FAMILIAR ONE.** The terrain sample **falls back to base 0 SILENTLY**
when the provider is the keyless `EllipsoidTerrainProvider`, or when the sample rejects/returns NaN
(`warnTerrainOnce`, one console line). A viewer cannot tell "seated on real ground" from "seated on
a fallback zero" — **failure and a legitimate value rendering identically.** That is the
§CONTEXT-DATA-HONESTY family again (L-422/457/467/469/579) and the L-459 pattern (a fabricated
height rendering like a measured one), reached through the terrain path this time.

### ⇒ WHAT THIS CHANGES IN THE PLAN

- **V6 gets much cheaper and does NOT need a DTM acquisition.** The question is no longer "what is
  the terrain?" but **"how far does the ground fall between the block centroid and the façade, and
  along the façade?"** — answerable by sampling the *existing* Cesium terrain at points we already
  compute. **No licence gate, no new source, no pipeline. It can be written today.**
- **G1 (the licence gate) does NOT block V6.** It still blocks the LiDAR *height* work.
- **V7 (the rasant rule) is unchanged and is now the LONG POLE.** We can already get ground
  elevation anywhere we like; what we cannot do is say **which point the ordinance measures from**.
  Knowing the ground shape was never the hard part.
- **A fourth task appears: make the terrain fallback HONEST** — a seat derived from a failed or
  absent terrain sample must be visibly distinguishable from a real one, exactly as L-582's
  fabricated 9 m context heights are drawn translucent.

**⚠ THE METHOD LESSON, WHICH IS THE REASON THIS SECTION EXISTS.** §2 was written from a competitor
screenshot plus an assumption about our own code, published to the audit, the plan, the hand-off
prompt and memory — **and then contradicted by the first grep.** *Probe the code before writing the
defect down*, including (especially) when the defect feels obviously true. That is the same failure
this session already logged twice on L-581.

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


---

# §8 · THE STUDY — footprint × height, terrain/DSM/DTM/point-cloud, and "would it be faster?"

*Answers the founder's four questions, 2026-07-22, before session close. Every number marked
**MEASURED** comes from this session's committed evidence (`scratchpad/l576-*.json`, L-582 sweep,
the context bake). Everything else is explicitly labelled.*

## Q1 · Where are we with `<footprint source>` + `<height source>`? Do we have 100%?

**No. Footprints are near-complete; heights are almost entirely absent.** They are two different
situations and lumping them as "source data" hides that.

| | Source | Coverage | Quality |
|---|---|---|---|
| **Footprint** | OSM, via our own bake | **MEASURED 104–121% of OSM ground truth** across three Barcelona districts | **Good.** Over 100% is correct — tile-edge clipping + multipolygon outer rings |
| **Height** | tags on those *same* OSM features | **MEASURED 0.9% surveyed** · 79.3% `building:levels` × our assumed 3.2 m · **19.8% fabricated 9 m** | **Bad, and 1 in 5 is invented** |

⇒ **The footprint layer is essentially solved. The height layer is 0.9% real.** So "do we have 100%
of the source data" resolves to: **yes for shape, no for height, and height is what the ordinance
and the visual both depend on.**

⚠ **This is exactly why the Gòtic envelope "looks flat" (L-527)** — not a rendering bug; the
neighbours around it have no measured heights.

## Q2 · Why don't we do what Cityweft does (separate footprint and height sources)?

**Not because the data is unavailable, and not because it is hard. Because of one modelling
decision we made early and never revisited.**

Our context feature carries **shape and height as one record from one provider**. `heightProvenance`
(L-582) records *how good* a height is, but there is **no field that can say "this shape came from
OSM and this height came from LiDAR."** So a second height source has nowhere to go. Cityweft's
entire layer matrix is downstream of having made the opposite choice.

⚠ **The honest reading: this is a self-inflicted limitation, not a data gap.** The sources they use
appear to be public. **We should do the same thing** — the work is (a) split the provenance pair in
the feature model, (b) bake a height attribute from an nDSM, (c) prefer measured over estimated per
feature with the tier surfaced. **(a) is the enabling change and it is a schema change, not a
pipeline.**

⚠ But see Q4 before scheduling it, and note the licence gate G1 can still veto (b).

## Q3 · Why don't we have terrain? — **⚠ WE DO. I WAS WRONG; SEE THE CORRECTION ABOVE §3.**

We sample **real Cesium World Terrain** and seat the massing on it. The defect is narrower: **ONE
sample at the block CENTROID**, so the envelope is a **flat slab at centroid elevation**, while the
ordinance measures from the ***rasant* at the FAÇADE**. Plus a **silent fallback to 0**.

⇒ **Ground elevation was never the blocker. The blocker is V7 — which point the ordinance measures
FROM.** No dataset answers that; only the ordinance text does.

## Q4 · ⚠ WOULD IT BE FASTER / MORE PERFORMANT? — **THE ANSWER IS COUNTER-INTUITIVE**

**Adding LiDAR heights would cost us approximately NOTHING at runtime — *if* we do it our way and
NOT the way the competitor's UI implies.**

**Today, MEASURED:** 42 tiles · **13.4 MB tileset** · 9,762 footprints · **~1 s**, read as byte
ranges straight from R2. The client already fetches every one of those tiles.

- **Our way — bake `height` as a per-feature ATTRIBUTE into the EXISTING PMTiles.** A float per
  feature in tiles we already request. **Zero extra HTTP requests. Zero extra round-trips.** Tile
  bytes grow slightly; MVT attribute encoding is compact and the tiles compress. **Runtime cost ≈ 0,
  and the *rendering* gets cheaper**, because real heights beat the fabricated-9 m translucent path.
- **Their way — a selectable height LAYER composed at runtime.** Flexible for a user who wants to
  compare providers, but it implies **a second fetch path**. For us that is strictly worse: it is
  the shape of **L-513**, the defect that made the 3D Site unusable and cost this session's first
  half. **We already learned this the expensive way.**

⇒ **Do NOT copy their runtime composability. Copy their SOURCE SEPARATION, resolve it at BAKE time,
and ship one fused tileset.** A user does not need a provider switch; they need a height that is
true and a tier that says how true.

⚠ **THE REAL COST IS OFFLINE, AND IT IS NOT SMALL.** Point clouds are large: the bake input is
already a 266 MB regional extract; **LiDAR for the same area is plausibly 1–2 orders of magnitude
bigger** *(⚠ ESTIMATE — V4 must measure it)*. Deriving an nDSM means DSM − DTM, rasterised, then
per-footprint zonal statistics. That is a **batch job**, days of engineering, not a fetch.

⇒ **Runtime: free. Build: expensive. Which is the right trade for us** — the same trade the context
bake already made and won.

## §8.1 · DSM / DTM / nDSM / point cloud — the distinction that decides the work

Conflating these is the most common way to plan this wrong:

| Term | What it is | What it gives us | Have it? |
|---|---|---|---|
| **DTM** *(terrain)* | bare earth, buildings removed | the **rasant** datum for Art. 327 | ✅ **effectively — Cesium World Terrain, sampled today** |
| **DSM** *(surface)* | everything: roofs, canopy | roof absolute elevation | ❌ |
| **nDSM** | **DSM − DTM** | ⭐ **BUILDING HEIGHT above ground** — the number we actually need | ❌ |
| **point cloud** | raw classified LiDAR returns | the input all three are derived from | ❌ |

⚠ **The deliverable is the nDSM, and it is DERIVED, not downloaded.** Asking "can we get Spain
LiDAR?" is the wrong question; the question is **"can we get, or compute, an nDSM, and may we
redistribute it commercially?"** (G1). ⚠ And note the asymmetry: **the DTM we already have is enough
for V6 (terrain) but useless for heights** — different products, different work, and V6 must not be
blocked behind the LiDAR programme.

## §8.2 · ⇒ RECOMMENDATION

1. **L-581 clamp still goes first.** 5.8% → ~20.4%. None of this moves that number. *(This is the
   one place a competitor conversation is most likely to cause damage — by reordering the board.)*
2. **V6 next — it is now hours, not weeks.** Sample the terrain we already have at centroid vs
   façade and report the delta. Decides whether the datum defect is P1 or noise.
3. **V7 in parallel — founder/legal, not engineering.** The long pole, and no dataset can shortcut it.
4. **Make the terrain fallback honest** — small, and it closes a live §CONTEXT-DATA-HONESTY hole.
5. **Then, and only after G1 clears: split footprint/height provenance and bake the nDSM.** Runtime
   free, build expensive, unblocks L-527 and 12b.

⚠ **What NOT to do:** do not build a provider-switch UI, do not add a runtime height fetch, and do
not treat "get LiDAR" as one task — it is *licence → acquire → derive nDSM → zonal stats → bake*,
and **the first step can veto the other four.**


---

# §9 · "WOULD IT BE QUICKER TO USE DSM / POINT CLOUD / DTM + SEPARATE SOURCES?"

*Founder question, 2026-07-22. Short answer: **not at runtime — that is already at its ceiling.
For heights, nothing is quicker because there is no heights programme to beat. And terrain has a
resolution trap that must be probed BEFORE the terrain work is scheduled.***

## 9.1 · Runtime — **NO, AND IT CANNOT BE**

**MEASURED today: 42 tiles · 13.4 MB · ~1 s**, byte-ranged from R2, pre-baked. A height attribute
baked into those tiles rides in requests we **already make**: same count, same round-trips.

⇒ **The best any new source can achieve is "exactly as fast as now."** The only available direction
is slower — which is precisely what runtime layer-composition (the competitor's UI shape) would do,
and that is the shape of **L-513**. **There is no speed argument for changing anything.** If someone
proposes a new source *for performance*, the answer is no.

## 9.2 · Heights — **NOTHING IS QUICKER, BECAUSE WE ARE DOING NOTHING**

There is no current heights programme to be quicker than: we read OSM tags, **0.9% surveyed**. So
the real question is *which acquisition path is fastest*, and there are two, not one:

| Path | Effort | Quality | Blockers |
|---|---|---|---|
| **A · Overture / MS ML height attributes** | **days** — attribute join, reuse the EXISTING bake, **no raster, no point cloud, no zonal stats** | ⚠ **ML-ESTIMATED** | licence (ODbL etc.) |
| **B · nDSM from PNOA LiDAR / ICGC** | **weeks** — acquire → DSM−DTM → rasterise → per-footprint zonal stats → bake | **MEASURED** | **G1 licence gate can veto** |

⚠ **THE TRAP IN PATH A, AND IT IS THE WHOLE DECISION.** Microsoft/Overture heights **may themselves
be estimates**. Replacing *our* estimate (`building:levels` × an assumed 3.2 m) with *their* estimate
is **not progress** — it is the same epistemic value wearing a better provenance label, which is the
**L-459** pattern exactly.

⇒ **GATE ON THIS, BEFORE ANY INGESTION:** validate path A against the **0.9% of OSM buildings that
carry a SURVEYED `height`** — the one independent ground truth we hold. **If it does not beat
`levels × 3.2 m`, path A is worth nothing and the honest move is to wait for B.** Cheap to run,
and it can save weeks in either direction.

## 9.3 · ⚠⚠ TERRAIN — THE RESOLUTION TRAP (NEW PROBE **V8**, RUNS BEFORE V6)

§8 concluded "we already have terrain, V6 is hours." That is right about **availability** and says
**nothing about RESOLUTION** — which decides whether V6 can answer its question at all.

> **If Cesium World Terrain is ~10–30 m postings under Barcelona, it CANNOT resolve a 20 m street.**
> The centroid sample and the façade sample would land in the **same terrain cell**, and **V6 would
> report a delta near zero for INSTRUMENTAL reasons — not because the ground is flat.**

⚠ That is the **wrong-instrument** failure from [[probe-can-be-wrong-three-ways]]: a probe that
measures the TOOL instead of the WORLD, and reports a reassuring number either way. It would close
the terrain question **falsely**, which is worse than leaving it open.

**V8 — establish the actual posting spacing of the terrain provider under Barcelona** (sample a
known slope at decreasing spacings; find where the returned profile stops changing). **V8 GATES V6.**

⇒ **THIS is the one place where switching to IGN MDT / ICGC may be genuinely NECESSARY rather than
merely nicer.** ICGC is believed to publish fine-resolution DTMs for Catalonia *(⚠ UNVERIFIED)*. If
V8 shows the current terrain is too coarse for façade-level rasant, a DTM upgrade moves from
"optional polish" to **a prerequisite of the legal calculation**.

⚠ Note the asymmetry that keeps catching us: **a DTM upgrade serves the RASANT question and does
nothing for building heights; an nDSM serves HEIGHTS and does nothing for the rasant.** They are
separate programmes with separate licences. Do not fund them as one line item.

## 9.4 · ⇒ ANSWER, IN ONE PARAGRAPH

**Quicker? No — and speed is the wrong reason to do any of it.** Runtime is already at its ceiling
and cannot improve. Heights have no incumbent to beat, so the choice is *estimated-in-days* (path A,
worthless unless it beats our ground truth) vs *measured-in-weeks* (path B, licence-gated). Terrain
we already have, but **possibly at the wrong resolution to answer the question we need it for**, and
**V8 must settle that before V6 runs.** ⚠ **None of it moves the 5.8% end-to-end number — that is
L-581.** Do this work because the answers are **wrong or unverifiable without it**, never because it
would be faster.
