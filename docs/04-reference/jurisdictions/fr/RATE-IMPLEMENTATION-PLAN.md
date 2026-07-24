# Rate Implementation Plan — France (`fr`) national

**Current rate:** ~22% (see [`RATE.md`](./RATE.md)) · **Realistic ceiling:** ~30–35% (without CNIG
SRU); ~85–90% (with full national CNIG SRU rollout) · **Gap to ceiling:** ~8–13 pts (structural
ceiling) · **Gap to Denmark (~96%):** ~74 pts · **Last updated:** 2026-07-24 · **Owner:** UNASSIGNED

---

## 1 — The ceiling: what "maximum" means here

France's realistic ceiling **without policy change** is **~30–35%** — the ceiling Denmark (~96%)
proves is achievable when a country digitises its planning rules into structured fields, but France
is not on that trajectory today. The infrastructure to identify zones and link to PDFs is world-
class (GPU WFS, apicarto, BD TOPO); the bottleneck is that numeric rules (height, emprise au sol,
setbacks) live inside per-commune PDF règlements for ~95% of France's ~34,900 communes.

**What sets the ~30–35% ceiling without policy change:**
- The ~22% baseline already captures parcel geometry (~100%), zone identification (~95%), and
  existing building heights via BD TOPO (~85%) — all the layers that are already structured.
- Raising it to ~30–35% requires transcribing height/emprise articles from PDF règlements for the
  three studied metros plus any additional métropoles that publish Lyon-style structured GIS height
  layers. This is a per-commune manual effort, not a pipeline.
- Two out of three studied metros (Paris, Marseille) require new engine KINDs before any numeric
  fill is possible — a reference-surface + gabarit formula (Paris) and a graphic-primacy resolver
  (Marseille). Lyon's structured `pluhauteur` GIS attribute is the only existing Tier 1 path.

**What would raise the ceiling above ~35%:**
The **CNIG SRU** (Structuration du Règlement d'Urbanisme) standard, when adopted nationally, would
provide structured numeric data per zone — the French equivalent of Denmark's Plandata. As of 2026
only 2 pilot communes are live. Full national rollout would push the ceiling to ~85–90%, but this
is outside this project's control and is measured in years, not quarters.

**Denmark comparison:** Denmark hits ~96% via Plandata delivering height and density per plan
polygon as structured fields. France's GPU WFS delivers zone code and PDF link — the same first
two steps — but not the numeric rules. The gap is one structural missing piece (a règlement-
structured-data field), which France has legislated toward (CNIG SRU) but not yet implemented.

**Barcelona comparison (pilot model):** Barcelona's climb used a per-clau sourcing programme (one
règlement block → one pack → structured fields). France's equivalent per-EPCI approach is the same
pattern at a larger scale: one PLUi document (e.g., Lyon's PLU-H) covers 58 communes at once —
a genuine efficiency. The sequencing principle mirrors Barcelona's: start with the most defensible
city (Lyon, the cheapest Tier 1 structured-attribute case), not the most representative one.

---

## 2 — Phase tracker

| Phase | Goal | Unlocks | Rate: from→to | Effort | Status | Owner |
|---|---|---|---|---|---|---|
| **0** | Assess — GPU WFS + BD TOPO live probes; write RATE.md; classify Paris/Lyon/Marseille as structurally different software problems | Honest baseline: ~22% confirmed; three-tier taxonomy (structured GIS / coded / graphic-primary) established | — → ~22% | Complete | VERIFIED | UNASSIGNED |
| **1** | Scan ~22 French métropoles' open-data portals for `hauteur`/`HBCPRINC`/`gabarit` structured attributes; identify additional Lyon-style Tier 1 cities | Converts "which city to do next" from a guess to a measurement; may reveal 3–5 cheap structured-attribute wins before any PDF work | ~22% → ~22% (survey only; national rate unchanged) | Low–Medium | NOT STARTED | UNASSIGNED |
| **2** | Lyon: probe `pluhauteur` full null rate (bbox count vs parcel count); confirm outer-commune coverage; wire `pluhauteur` as a structured height source | First city with a computable cited height — Lyon moves from ~42% to ~55–65% depending on coverage confirmation | ~22% → ~23–24% (blended; Lyon is ~1.4% of France's communes but 2.5M+ population) | Low–Medium | NOT STARTED | UNASSIGNED |
| **3** | Fix GPU WFS `wfs_sup:assiette_sup_s` GetFeature (correct endpoint / request format); confirm ABF sub-type code | ABF overlay structurally queryable nationwide — a safety net for every French city pack | ~23–24% → ~24–25% | Low | NOT STARTED | UNASSIGNED |
| **4** | Paris: read PLU bioclimatique UG.10 (`haut` letter decoding table); UG.9 (emprise au sol); UG.6/7 (setbacks); build ADR-0274 reference-surface + gabarit KIND | Paris moves from ~35% to ~55–60%; new engine KIND for the reference-surface + gabarit formula | ~24–25% → ~25–27% (blended; Paris is ~2.2M population) | High — new rule KIND; ~24–29 dev-days | NOT STARTED | UNASSIGNED |
| **5** | Marseille: probe `sig.ampmetropole.fr` for machine-readable graphic layer; if confirmed, build graphic-primacy resolver KIND; read UA/UB/UC written height articles as fallback | Marseille moves from ~18% to ~20–25% (written fallback only) or ~45–55% (machine-readable graphic layer) | ~25–27% → ~27–30% (blended; contingent on graphic layer result) | High — new rule KIND; ~20–24 dev-days | NOT STARTED | UNASSIGNED |
| **6** | Source additional Tier 1 métropoles identified in Phase 1; wire structured attributes for each | Each additional city with a Lyon-style structured layer is a cheap incremental gain | ~27–30% → ~30–35% (ceiling without CNIG SRU) | Medium — per city | NOT STARTED | UNASSIGNED |
| **7** | CNIG SRU monitor: when SRU communes reach scale of a target city, pivot to national structured-règlement pipeline | Structural ceiling rises from ~30–35% to ~85–90% | Political/legislative — outside this project's control | BLOCKED (external) | UNASSIGNED |

---

## 3 — The gap to Denmark (~96%)

Denmark's ~96% rests on Plandata exposing zone type, FAR, and height as machine-readable structured
fields per plan polygon. France's gap has two structural components:

**(a) Rules in PDFs, not structured fields (the dominant gap).** The GPU WFS delivers zone code and
a direct PDF link with page anchor — it is halfway to Denmark. The missing half is the numeric
content of that PDF as a structured field. France has legislated the fix (CNIG SRU), but the
rollout timeline is years. Until SRU, every commune's height is locked in the PDF.

**(b) Three independent engine kinds required before any numeric fill.** Unlike Norway (uniform
planregister schema) or Germany (XPlanung), France's three largest cities use three structurally
different height mechanisms requiring three different rule KINDs. This is not a data problem — it
is an engine-scope problem: each KIND is a discrete ADR-approved engineering effort. Until Paris's
reference-surface + gabarit KIND and Marseille's graphic-primacy resolver are built, those cities
produce zero numeric fills regardless of how much sourcing work is done.

**(c) 34,900 communes — an open-ended commitment without SRU.** Per-commune PDF transcription is
scalable as a sourcing programme (especially for PLUi EPCI documents covering many communes at
once), but it is a sustained manual operation, not a pipeline. The 34,900-commune ceiling cannot
be approached without either CNIG SRU adoption or an OCR/LLM transcription pipeline with the L-449
human-verification gate.

---

## 4 — Dependencies, blockers, and cross-jurisdiction reuse

**Prerequisites:**
- **Phase 1 (métropole scan) before Phases 4–6:** the scan identifies which cities are Tier 1
  (cheap structured-attribute) vs Tier 2 (new KIND required). Committing dev-days to Paris or
  Marseille before this scan risks missing cheaper wins.
- **Phase 3 (ABF fix) is independent** and can run in parallel with any other phase — low effort,
  national benefit.
- **Phase 4 (Paris) requires a new ADR-approved engine KIND** (reference-surface + gabarit,
  tentatively ADR-0274). This KIND cannot be built inside a PLU sourcing task — it is a separate
  engineering scope item. Allow 4–5 dev-days for the ADR alone.
- **Phase 5 (Marseille) graphic-layer probe** must complete before committing to the graphic-
  primacy resolver KIND. If the graphic layer is raster-only, the implementation cost doubles
  (~6–8 additional dev-days for digitizing) and the Marseille ceiling drops to ~20–25%.

**Cross-jurisdiction reuse:**
- The national parcel ingestion (IGN PCI Express / apicarto) is already characterised for France
  and can be reused verbatim for all 34,900 communes — the one genuine nationwide efficiency.
- The GPU WFS zone-identification path is identical for every French commune — built once in the
  Barcelona pipeline (same IGN infrastructure), reused here.
- The BD TOPO® `hauteur` existing-building-height layer is national, free (Etalab 2.0), and
  requires no per-commune work — the context-data layer is solved once for all of France.
- The Paris gabarit KIND (H = P + 3.00 + D from a reference surface) is architecturally identical
  to Brussels' RRU Titre I KIND (same formula, same inputs). If Brussels' KIND is built first,
  Paris's KIND may reuse its resolver pattern with a different reference-surface computation.
- The L-449 per-règlement human-verification gate is the same process used for every sourced
  jurisdiction; no France-specific gate needed — the clause-citation → human sign-off flow applies
  directly.
- The LiDAR HD pipeline (footprint + point cloud → LOD2 reconstruction via 3dfier/GeoFlow) has no
  licence barrier for France (Etalab 2.0) — the compute pipeline built for France applies to 100%
  of French territory once LiDAR HD reaches full coverage (targeted end-2026).

**Governing documents:** C58 (fidelity/provenance) · ADR-0269 (curate-then-serve) · L-449
(human-verification gate) · Code de l'urbanisme · loi ALUR 2014 (COS abolition) · ordonnance
n° 2021-1310 (GPU legal executory status from 2023) · CNIG SRU standard (2 pilot communes, 2026).

---

*Model references: **Denmark** `../dk/` (ceiling, ~96%) · **Barcelona**
`../es/es-ct/08019-barcelona/` (pilot climb — per-EPCI sourcing mirrors the Barcelona per-clau
sourcing programme). Governing: **C58** · **ADR-0269** · **L-449**.*

*Last updated: 2026-07-24. Maintainer: UNASSIGNED.*
