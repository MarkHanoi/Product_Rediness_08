# Rate Implementation Plan — Spain (`es`) national

**Current rate:** ~34% (see [`RATE.md`](./RATE.md)) · **Realistic ceiling:** ~55% ·
**Gap to ceiling:** ~21 pts · **Gap to Denmark (~96%):** ~62 pts ·
**Last updated:** 2026-07-30 · **Owner:** UNASSIGNED

> **⚠ HONESTY GATE (§CONTEXT-DATA-HONESTY).** This is a PLAN. It changes **no RATE % cell** — the
> national number stays ~34% and every [`COUNTRY-RATE.md`](./COUNTRY-RATE.md) axis cell stays exactly
> where the C63 audit set it until each phase below actually lands and the scorecard is re-derived.
> Spain is the **reference country** (VERIFIED-PRIMARY: Barcelona ships on this stack), so — unlike the
> PT/DE/IT/US aspirational plans — the sources here are real and mostly wired. But "already wired for
> Barcelona" is **not** "re-probed for the next city": every geospatial row is
> **`VERIFIED-PRIMARY · captured, re-probe before prod`** (see
> [`ES-GEOSPATIAL-DATA-INVENTORY.md`](./ES-GEOSPATIAL-DATA-INVENTORY.md)). **Ship the probe before the
> fix.** The Phase-3 roadmap (§Phase-3) is the ROI sequence; the "Rate: from→to" cells in §2 are the
> plan's own honest *estimates* of the jump, not claims a jump has landed.

> **Why Spain leads the rollout: it is the most-wired country.** Where PT's ceiling *rose* on a
> **discovery** (the DGT platform, all `CONVERGENT-SECONDARY`), Spain's advantage is that the
> geospatial half is **already real and partly baked**: Catastro parcels + footprints are the
> production zoning spine, **MDS Edificación** gives a national building-height raster (the edge no
> other country has), and **PNOA** terrain + ortho + LiDAR are open and national. So Spain's roadmap
> is not "discover + probe" — it is **"bake + verify + extend the pilot,"** which is why the
> highest-leverage first move (§Phase A) is a *re-bake*, not a sourcing hunt. Full source catalogue:
> [`ES-GEOSPATIAL-DATA-INVENTORY.md`](./ES-GEOSPATIAL-DATA-INVENTORY.md); per-layer analysis:
> [`findings/SPAIN-CONTEXT-DATA-DEEP-DIVE-L512.md`](./findings/SPAIN-CONTEXT-DATA-DEEP-DIVE-L512.md).

---

## 1 — The ceiling: what "maximum" means here

Spain is **PDF-bound, not structured-bound**. Its ceiling is NOT Denmark's ~96%, because Denmark's
numbers already exist as structured national fields (Plandata) and Spain's do not — they are authored
per-municipality inside ~8,131 PGOU/PGM ordinance PDFs (L-450). The single structural fact that sets
the ceiling: **the national planning-data layers deliver the zone CODE, never the dimensional NUMBER**
(confirmed live across all three Tier-1 regions, 2026-07-20). So the maximum reachable rate is a
function of how much of that PDF corpus a transcription/OCR pipeline + the L-449 human gate can
convert to structured values — and that climb is bounded by two facts the city measurements already
proved: (a) OCR of the derived-planning corpus yields a *sector FAR* but **~0% parcel-level height**
(Barcelona L-590h — height is on un-OCR-able plànol block-labels), and (b) coverage is delivered
per-municipality, so every point of national gain is 8,131 separate ingestion problems, not one.

A realistic national ceiling is therefore **~55%**: the strong Catastro geometry base (~95% parcel,
~55% footprint) plus a transcribed zone→number table for the high-population regions plus OCR-partial
answers for the shape-B long tail — but **not** the parcel-level heights that need plànol
vectorisation, and **not** the ~15% of the country whose PGOUs are pre-digital scans behind heritage
regimes. The number climbs one region and one city at a time; it does not jump.

### 1.4 — The geospatial half is VERIFIED-PRIMARY (what raises Spain fastest)

The ~55% ceiling above is set by the **LEGISLATION + ENVELOPE** PDF cap (45% of the C63 weight). But
the *fastest* movement available today is on the **geospatial half** (55% of the weight), because for
Spain those axes are not blocked — they are real, open, and partly baked. Mapping the deep-dive onto
the seven C63 axes and their ratified weights (C63 §4):

| C63 axis | Weight | Spain state (VERIFIED-PRIMARY, captured) | Phase |
|---|---:|---|---|
| **DATA-SOURCES** | 15% | **Highest-wired in the set** — Catastro + MDS Edif + PNOA terrain live; `heightSources.mjs` already maps ES cities to `mds_edificacion` | A/B |
| **HEIGHTS / LOD** | 10% | **measured-capable** — MDS Edificación ready-bbox; Barcelona baked, other capitals `(cap)` unbaked | **A** |
| **PARCEL** | 15% | Tier-A country (Catastro national geom+id+area); sample-runs not yet drawn per city (foral cities need the adapter) | **B** |
| **TERRAIN** | 10% | PNOA MDT baked for pilots; needs per-city bake + `terrain.verify.mjs` round-trip | **B** |
| **CONTEXT** | 5% | ~5/9 layers baked; rail + trees + pedestrian are the L-642 additions still absent | B (trail) |
| **LEGISLATION** | 25% | PDF-bound; the surviving cap (§1/§3) — Barcelona clau packs the only depth | **C** |
| **ENVELOPE** | 20% | Barcelona 13a envelope SHIPPED; every other city `not-assessed` | **C** |

The five geospatial axes are **fillable now** (bake + verify + extend), so the ROI sequence front-loads
them: **A** (heights re-bake, cheapest + flagship) → **B** (parcel + terrain verify) → **C** (the
human-gated rule-pack expansion that is the real ceiling). This is **CONTINGENT on the re-probes in
[`ES-GEOSPATIAL-DATA-INVENTORY.md` §Probe steps](./ES-GEOSPATIAL-DATA-INVENTORY.md)** landing; **no RATE
cell moves until a phase lands and the scorecard is re-derived.**

---

## 2 — Phase tracker

Status vocabulary is FIXED: **NOT STARTED · IN PROGRESS · BLOCKED · SHIPPED · VERIFIED · N/A**.
"Rate: from→to" is the honest estimated jump in the RATE.md number when the phase lands — NOT a claim
it has landed. ⚠ Status tracks WORK; the rate only moves when RATE.md is re-derived.

| Phase | Goal | Unlocks | Rate: from→to | Effort | Status | Owner |
|---|---|---|---|---|---|---|
| **0** | Assess — live endpoint/schema probes across the CCAA; write this RATE.md | the honest baseline | — → ~34% | done | **VERIFIED** (`SPAIN-ZONING-LIVE-VERIFICATION`, `es/README.md`) | UNASSIGNED |
| **1** | Catastro parcel + construction as the national geometry spine (parcel-select everywhere common-regime) | the denominator for every downstream number | ~34% (already in the base) | shipped | **SHIPPED** (in production) | UNASSIGNED |
| **1b** | Foral-cadastre adapter (País Vasco + Navarra) | parcel-select for 16 SEED municipalities | +~1% → ~35% | Medium | NOT STARTED | UNASSIGNED |
| **2** | Pilot city depth — **Barcelona** clau packs (the proven climb; see [`es-ct/08019-barcelona/`](./es-ct/08019-barcelona/RATE-IMPLEMENTATION-PLAN.md)) | the reusable pattern: PGM transcription + block-derived construction + refusal vocabulary | Barcelona 24%→~48%; national +~2% → ~37% | ~21 wk (1 dev) | **IN PROGRESS** (1b/1c refusals SHIPPED; 13a shipped) | UNASSIGNED |
| **3** | Tier-1 region zone→number transcription (Cataluña / Madrid / Valencia most-common zones), L-449-gated | structured density+height for ~42% of the SEED-318 tier | +~10% → ~47% | High (human, per-region) | NOT STARTED | UNASSIGNED |
| **4** | Ordinance-extraction (OCR) pipeline for shape-B cities (clean scanned PGOU → values → sign-off) | partial numeric answers for the long-tail municipalities (Córdoba is the proof case) | +~6% → ~53% | High | **IN PROGRESS** (Córdoba pilot extracted, unverified) | UNASSIGNED |
| **5** | PNOA LiDAR nDSM (heights) — licence-gated | measured building height replacing coarse floor-count | +~2% → ~55% (ceiling) | Med–High; **BLOCKED on L-584 V2 licence** | BLOCKED | UNASSIGNED |

---

## Phase-3 — Geospatial ROI roadmap (NEW, 2026-07-30)

The reference-country ROI decomposes into three ordered phases keyed to how wired Spain already is.
**A** is the flagship heights re-bake (the cheapest, highest-leverage win — a bake, not a sourcing
hunt); **B** verifies the parcel + terrain axes on the already-wired feeds; **C** is the human-gated
rule-pack expansion that is Spain's surviving ceiling. Each phase lists **goal · unlocks · axis ·
effort · dependency · blocker**. Every row is `VERIFIED-PRIMARY · captured` until the named re-probe
runs — the queue lives in
[`ES-GEOSPATIAL-DATA-INVENTORY.md` §Probe steps](./ES-GEOSPATIAL-DATA-INVENTORY.md). **No RATE cell
moves on this section — it is the PLAN.**

### Phase A — Barcelona MDS re-bake (the flagship heights fix) — start HERE

- **Goal.** Re-bake the metro-capital context PMTiles through the **MDS Edificación join** so building
  heights flip from **estimated** (OSM 9 m assumed / Catastro `ALTURAS`×3 m derived-levels) →
  **measured** (`mdsn_e025` P90, `tagged`) → **solid** (real skyline). Concretely: extend the ready
  per-city bboxes in `tools/context-bake/heightSources.mjs` MDS join to the remaining metro capitals
  and re-bake. **Barcelona's bbox is already in the ready list** (`'2.05,41.32,2.24,41.47'`,
  `barcelona → mds_edificacion`, baked + shipping) — the other capitals are mapped in `REGION_SOURCE`
  but their per-city bbox bake rows are **not yet added**, so they render honest-9 m today (the
  `(cap)` = "measured-capable but unbaked" flag in [`COUNTRY-RATE.md`](./COUNTRY-RATE.md)).
- **Unlocks.** A **HEIGHTS / LOD jump** (Axis 6) — every ready-bbox city flips from `not-assessed`/
  `derived-levels` to `tagged` measured heights the moment its bake lands. This is the single cheapest
  axis gain in the whole ES plan (`heightSources.mjs` already holds the wiring; the whole-country
  `spain` bbox is refused per-tile, so the work is per-city bbox rows, not new sourcing).
- **Axis.** HEIGHTS / LOD (Axis 6) — with a DATA-SOURCES (Axis 3) knock-on as more cities read `live`.
- **Effort.** **Low.** No new sourcing. Add the metro-capital bboxes (Madrid, Valencia, Sevilla,
  Málaga, Zaragoza, Bilbao…) to the MDS join ready-list + re-bake per city (~1 bake/city). MDS is a
  keyless CC-BY WCS already live-verified 2026-07-26.
- **Dependency.** The shared nDSM/height module (already built for Barcelona); `spain-latest.osm.pbf`
  (already covers every metro bbox); the MDS Edificación WCS re-probe (§Probe step 3).
- **Blocker.** None hard. The whole-country `spain` bbox cannot be baked in one pass (Catastro has no
  single whole-country query) — heights land **per city bbox**, so this is a widening loop, not one
  shot. Foral cities (País Vasco / Navarra) still need the parcel adapter for the *parcel* axis, but
  **heights are unaffected** (MDS is national and foral-agnostic).

### Phase B — Parcel sample-runs + terrain verify

- **Goal.** Draw the C57 **parcel-confidence sample** per metro city over the wired Catastro feed
  (`computeParcelConfidence` / `computeParcelMetrics` on an N-parcel bbox sample) so PARCEL flips from
  `not-assessed` to a cited-derived score; and **bake + verify** the PNOA MDT terrain tileset per city
  (`terrain.verify.mjs` independent-decoder round-trip) so TERRAIN moves off the unverified rung.
- **Unlocks.** **PARCEL (Axis 1) + TERRAIN (Axis 5)** — both on already-wired national feeds (Catastro
  parcels, PNOA MDT). Spain is a Tier-A parcel country, so the sample should score high on the common
  regime (foral cities score low until the adapter lands — an honest cap, not a bug).
- **Axis.** PARCEL (Axis 1) · TERRAIN (Axis 5) · CONTEXT (Axis 7, trailing — rail/trees/pedestrian are
  the L-642 bake additions).
- **Effort.** **Low–Medium.** Parcel sample is a script run per city (no sourcing). Terrain is one
  `REGIONS` row + a bake + the verify round-trip per city.
- **Dependency.** Phase A tooling (per-city bake loop) reused; the Catastro INSPIRE WFS re-probe
  (§Probe step 2, native `EPSG::25830/25831` to dodge the 4326 axis-order exception); the foral
  cadastre adapter for País Vasco / Navarra cities (parcel only).
- **Blocker.** Foral cadastres (`CatastroEus` / `CatastroNav`) are **not** served by the national DGC
  WFS — 16 SEED municipalities' PARCEL axis stays capped until the adapter exists (already logged for
  zoning; solve once). The high-relief white-mask terrain defect (L-636) must not regress on re-bake.

### Phase C — Envelope rule-pack expansion (the human-gated ceiling)

- **Goal.** Extend the proven Barcelona pattern — the **per-clau rule pack + block-derived construction
  envelope + refusal vocabulary**, all behind the **L-449 human-verification gate** — from Barcelona
  (whose **13a envelope SHIPPED**) to Madrid and the other capitals: source each city's MUC/PGOM zone
  ordinances, transcribe zone→number, author the pack, and pass every value through L-449 before it
  serves at `confidence: structured`.
- **Unlocks.** **LEGISLATION (Axis 2) + ENVELOPE (Axis 4)** — the two axes that are 45% of the C63
  weight and Spain's **surviving cap**. The geospatial phases (A/B) do **not** touch these; only sourced,
  cited, human-verified ordinance values raise them.
- **Axis.** LEGISLATION (Axis 2) · ENVELOPE (Axis 4).
- **Effort.** **High** — this is the "whole cost": human-gated legal **SOURCING**, per municipality.
  Bounded by the two facts the Barcelona measurements proved: OCR of the derived-planning corpus yields
  a sector FAR but **~0% parcel-level height** (height is on un-OCR-able plànol block-labels, L-590h),
  and delivery is per-municipality (~8,131 separate ingestion problems, not one). Reusable machinery:
  the `dissolveParcelsToBlockRing` + street-width from Barcelona, the `explicit-area` ringRef resolver
  from Madrid NZ 1, and the Córdoba ordinance-extraction pipeline (shared ES/FR/PT/UK OCR investment).
- **Dependency.** L-449 (mandatory gate before any extracted number serves `structured`); ADR-0269
  (curate-then-serve — no value without a cited governing article in `SOURCES.md`); ADR-0271
  (Barcelona's block-derived depth construction); the `dissolveParcelsToBlockRing` geometry stage,
  which succeeds Barcelona 2/2 but **Madrid 2/4 · Córdoba 0/3** — the dissolve fix is sequenced
  *before* rule work outside Barcelona (`SPAIN-CADASTRAL-DISSOLVE-PROBE.md`).
- **Blocker.** **The MUC/PGOM ordinance-sourcing cap is human-gated and per-municipality** — no
  national structured planning field exists (the zone CODE is served, the dimensional NUMBER never
  was). This is the same cap as §1/§3; it does not jump, it climbs city-by-city. Parcel-level heights
  need plànol vectorisation (out of scope for OCR).

---

## 3 — The gap to Denmark (~96%)

**Two of the three canonical structural separators apply, and both are load-bearing:**

- **(a) Numbers are in PDFs, not structured fields.** Spain's version is the sharpest in the corpus:
  the zone code IS structured (the regional WFS layers), but the dimensional value was never required
  to be digitised, so it sits in the ordinance prose. This needs transcription + the L-449 gate, and
  for the derived-planning slice OCR recovers a sector FAR but **not** the parcel height (it is on the
  plànol, not in the text — Barcelona L-590h, measured over 24 documents).
- **(b) Delivery is fragmented across ~8,131 municipalities.** Even a perfect per-municipality
  pipeline is 8,131 endpoints and 8,131 human sign-offs. Denmark is one national Plandata; Spain is
  the opposite extreme in the benchmark set. This is why the national number climbs city-by-city and
  region-by-region, and why "finish Barcelona to a defensible standard before widening" is the
  measured strategy (`SPAIN-GEODATA-SOURCE-COVERAGE` §10.8), not sentiment.

Licence-gating (c) applies only to the height layer (PNOA LiDAR, L-584 V2), not to the zoning numbers.

---

## 4 — Dependencies, blockers, and cross-jurisdiction reuse

- **Depends on:** C58 (fidelity/provenance), ADR-0269 (curate-then-serve), ADR-0270 (the
  setback/alignment/explicit-area rule union — Spain uses all three and Madrid's `Fondo` polyline is
  the reason `explicit-area` exists), ADR-0271 (Barcelona's block-derived depth construction), L-449
  (the human gate), L-450 (the PDF corpus on object storage).
- **Blocked:** Phase 5 (heights) on the L-584 V2 PNOA-LiDAR commercial-redistribution licence — a gate
  that can veto the whole nDSM branch and therefore runs before any pipeline work.
- **Reuse that makes the corpus cheaper than N separate builds:** the **ordinance-extraction
  pipeline** (`docs/04-reference/standards/ORDINANCE-EXTRACTION-PIPELINE.md`) built for Córdoba generalises to
  every shape-B Spanish city for free (same clean-scanned-PGOU shape); the **`explicit-area` ringRef
  resolver** designed for Madrid NZ 1 serves any jurisdiction that publishes a buildable footprint;
  the **`dissolveParcelsToBlockRing` + street-width** machinery from Barcelona serves every
  *alineació-de-vial* zone nationwide; and Valencia's **`url_abs`** (governing-document link on the
  polygon) is the model that turns PDF enumeration into a lookup. Cross-refs in
  `V1-LAUNCH-READINESS-AUDIT.md` (Pipeline A / L-393; §Barcelona complete-coverage L-538) and
  `SPAIN-CADASTRAL-DISSOLVE-PROBE.md` (block-ring success measured Barcelona 2/2 · Madrid 2/4 ·
  Córdoba 0/3 — the geometry stage fails outside Barcelona *before any rule is consulted*, which is
  why rule work is sequenced behind the dissolve fix elsewhere).

---

*Model references: **Denmark** `../dk/` (ceiling, ~96%) · **Barcelona**
`./es-ct/08019-barcelona/` (pilot climb) · **Portugal** `../pt/RATE-IMPLEMENTATION-PLAN.md` (the
Phase-3 A/B/C shape this mirrors). Governing: **C58** (fidelity/provenance), **ADR-0269**
(curate-then-serve), **L-449** (human-verification gate), **C63 §3/§4** (the seven axes + ratified
weighting). Data layer: [`ES-GEOSPATIAL-DATA-INVENTORY.md`](./ES-GEOSPATIAL-DATA-INVENTORY.md)
(21-row national inventory, all `VERIFIED-PRIMARY · captured`) ·
[`findings/SPAIN-CONTEXT-DATA-DEEP-DIVE-L512.md`](./findings/SPAIN-CONTEXT-DATA-DEEP-DIVE-L512.md)
(per-layer hierarchies + 3-tier badging matrix) · [`COUNTRY-RATE.md`](./COUNTRY-RATE.md) (per-city
composite) · [`RATE.md`](./RATE.md) (national structured-fill). Spain = reference country
(VERIFIED-PRIMARY, Barcelona ships) — but re-probe before prod; no RATE cell moves on this PLAN.*
