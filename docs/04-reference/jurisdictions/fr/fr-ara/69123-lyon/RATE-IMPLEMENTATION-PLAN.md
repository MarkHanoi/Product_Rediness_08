# Rate Implementation Plan — Lyon Métropole (`69123`) city

**Current rate:** ~42% (see [`RATE.md`](./RATE.md)) · **Realistic ceiling:** ~55–65% ·
**Gap to ceiling:** ~13–23 pts · **Gap to Denmark (~96%):** ~54 pts ·
**Last updated:** 2026-07-24 · **Owner:** UNASSIGNED

---

## 1 — The ceiling: what "maximum" means here

Lyon's realistic ceiling is **~55–65%** — the highest of the three studied French cities, and the
most achievable ceiling in France today. The upper end (~65%) applies if the `pluhauteur` coverage
fraction is high (>70% of Lyon-area parcels inside a `pluhauteur` polygon) and a PDF-reading
programme covers CES and setback articles for the main zone families. The lower end (~55%) applies
if coverage is moderate (~40–50%) or the Lyon/Villeurbanne height-perimeter overlay proves
expensive to implement.

**Lyon is the recommended first implementation target for France** — the cheapest city, the most
structured data, and the one case where no new engine KIND is required for the dominant mechanism
(the `pluhauteur` attribute is a direct numeric lookup, not a formula or a graphic layer).

**What sets the ~55–65% ceiling:**
- `pluhauteur` (absolute metres, no decode step) is the dominant lever. Coverage confirmation is
  the single most important remaining probe — it determines whether height fill is 30% or 70%.
- Emprise au sol (CES) and setbacks are PDF-gated but in one PLU-H document covering all 58
  communes — one sourcing effort, multi-commune benefit.
- Lyon and Villeurbanne use a separate height-perimeter overlay mechanism (not the `pluhauteur`
  polygon attribute) — this is an independent data-layer integration, ~8–10 dev-days, required
  before the two most central communes are covered.
- The GPU SUP overlay (ABF) is not yet confirmed per-parcel queryable — an unresolved overlay risk
  for parcels near Lyon's classified monuments.

**Denmark comparison:** Denmark's ~96% delivers height as a structured field per plan polygon
directly from Plandata. Lyon's `pluhauteur` delivers the same (absolute metres, WFS queryable) for
its covered area — the structural pattern is identical. The gap is that `pluhauteur` does not cover
100% of parcels (unlike Plandata's near-universal polygon coverage) and that emprise au sol and
setbacks are not in the GIS layer. Lyon is the most Denmark-like French city by data architecture.

---

## 2 — Phase tracker

| Phase | Goal | Unlocks | Rate: from→to | Effort | Status | Owner |
|---|---|---|---|---|---|---|
| **0** | Assess — `pluhauteur` confirmed live (absolute metres); `pluzone` height + CES fields confirmed null; RATE.md written | Honest baseline: ~42% confirmed; structured-attribute path identified; Lyon/Villeurbanne overlay exception characterised | — → ~42% | Complete | VERIFIED | UNASSIGNED |
| **1** | Probe `pluhauteur` null rate — WFS GetFeature count for full Lyon-Métropole bbox vs total parcel count; confirm whether the layer covers Lyon city and Villeurbanne or only outer 56 communes; confirm whether `HBCPRINC`/`PLAFOND` appear on national GPU WFS | Resolves the ±10 pp rate uncertainty; determines the implementation path (national GPU config vs `data.grandlyon.com` second data-source integration) | ~42% → ~42% (probe only; rate not changed) | Low — 2–3 WFS count queries + one GPU GetFeature | NOT STARTED | UNASSIGNED |
| **2** | Source one representative PLU-H zone (e.g. UCe1a) — read règlement verbatim for height bande principale/secondaire, CES, and setback articles; record clause citations in `sources/SOURCES.md`; obtain human `VERIFICATION.md` sign-off | Fills the L-449 provenance gate for PLU-H articles — prerequisite for shipping any PLU-H règlement article as a cited value | ~42% → ~42% (provenance gate; rate unchanged) | Low — one zone's rules, one PDF | NOT STARTED | UNASSIGNED |
| **3** | Wire `pluhauteur` as a structured height source (via `data.grandlyon.com` or national GPU WFS per Phase 1 result); implement zone-code → CES lookup from Phase 2 règlement for covered zone families | Lyon outer-commune parcels with `pluhauteur` coverage gain a cited height fill; CES partially sourced | ~42% → ~48–55% (depending on `pluhauteur` null rate confirmed in Phase 1) | Low–Medium — data wiring; no new KIND required | NOT STARTED | UNASSIGNED |
| **4** | Implement Lyon/Villeurbanne height-perimeter overlay join: source the "périmètres de hauteurs de façades" layer; join to parcel via spatial overlay; route Lyon/Villeurbanne parcels through overlay result, outer-commune parcels through `pluhauteur` | Covers the two most central communes; closes the PLU-H structural exception | ~48–55% → ~52–58% | Medium–High — ~8–10 dev-days overlay join logic | NOT STARTED | UNASSIGNED |
| **5** | Fix GPU WFS `wfs_sup:assiette_sup_s` GetFeature; confirm ABF coverage for Lyon-area classified monuments | ABF overlay queryable — converts heritage-zone parcels from "silent risk" to "detectable flag" | ~52–58% → ~55–60% | Low | NOT STARTED | UNASSIGNED |
| **6** | Source additional PLU-H zone families (UEi, URm, UPr) — read CES and setback articles verbatim; wire | Raises CES and setback fill from sample zone to main zone families | ~55–60% → ~55–65% (ceiling) | Medium — per-zone-family sourcing | NOT STARTED | UNASSIGNED |

---

## 3 — The gap to Denmark (~96%)

**(a) `pluhauteur` coverage is not 100%.** Denmark's Plandata covers effectively 100% of plan
polygons with structured height fields. Lyon's `pluhauteur` covers some fraction of parcels — the
fraction is unconfirmed but is the most important single unknown. Until probed, the residual (parcels
not inside a `pluhauteur` polygon) is a zero-fill gap that no amount of wiring resolves.

**(b) CES and setbacks are PDF-gated.** Unlike height, which has a dedicated GIS layer, emprise au
sol and setbacks are only in the PLU-H règlement PDF. For the 58 communes covered by one document,
this is a manageable one-time transcription task — but it is manual work, not a pipeline, and it
covers each zone family independently.

**(c) Lyon/Villeurbanne overlay is a structural exception.** The two most central communes use a
different height mechanism (périmètres de hauteurs de façades overlay) than the 56 outer communes.
This is not a data gap — both mechanisms are documented and the layers exist — but it is a separate
engineering effort that doubles the implementation scope for Lyon city proper.

**(d) PLUi scope: 58 communes, but sourcing covers all at once.** Unlike Germany (each municipality
is a separate sourcing task) or France's non-PLUi communes, Lyon's PLU-H document covers all 58
communes in one règlement. The sourcing investment (one PDF read per zone family) yields 58-commune
coverage — the most efficient unit of work in this study after Denmark itself.

---

## 4 — Dependencies, blockers, and cross-jurisdiction reuse

**Hard dependencies:**
- **Phase 1 (coverage probe) must precede Phase 3 (wiring)** — the `pluhauteur` null rate
  determines whether Phase 3 produces a 30% or 70% height fill. Committing wiring resources before
  this probe produces an unknown-variance outcome.
- **Phase 1 also determines the implementation path** (national GPU WFS vs `data.grandlyon.com`
  second data-source integration). This is a binary decision affecting all subsequent phases.
- **Phase 2 (L-449 gate) must precede any CES or setback wiring** — the human sign-off on clause
  citations is required before shipping PLU-H article values. Phase 2 can run in parallel with
  Phase 1.
- **Phase 4 (Lyon/Villeurbanne overlay) is independent** of Phases 3 and 5 — it can start
  whenever the overlay layer source is confirmed, without waiting for other phases.

**Cross-jurisdiction reuse:**
- The GPU WFS zone-identification path, the IGN PCI parcel ingestion, and the BD TOPO® building-
  height layer are shared with Paris and Marseille — one build for all three French city packs.
- The LiDAR HD pipeline (LOD2 reconstruction) applies to all of France (Etalab 2.0 licence);
  Lyon's LiDAR HD coverage is almost certain given it is a major metro — confirm with one tile-
  check at `macarte.ign.fr` before committing compute.
- If additional French métropoles are found (Phase 1 national scan) to publish `hauteur` GIS
  attributes on their own open-data portals, Lyon's `pluhauteur` wiring is the reference
  implementation — each additional city is a config extension, not a new build.
- The L-449 clause-citation → human verification → `VERIFICATION.md` flow is identical for every
  sourced jurisdiction.

**Governing documents:** C58 (fidelity/provenance) · ADR-0269 (curate-then-serve) · L-449
(human-verification gate) · Code de l'urbanisme · PLU-H Lyon Métropole (in force June 2019; 58
communes; `pluh.grandlyon.com`).

---

*Model references: **Denmark** `../../../dk/` (ceiling, ~96%) · **Barcelona**
`../../../es/es-ct/08019-barcelona/` (per-EPCI sourcing pattern mirrors Lyon PLU-H). Governing:
**C58** · **ADR-0269** · **L-449**.*

*Last updated: 2026-07-24. Maintainer: UNASSIGNED.*
