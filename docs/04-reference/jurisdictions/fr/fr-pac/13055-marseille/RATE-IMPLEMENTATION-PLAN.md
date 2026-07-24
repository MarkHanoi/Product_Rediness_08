# Rate Implementation Plan — Marseille / AMP Territoire 1 (`13055`) city

**Current rate:** ~18% (see [`RATE.md`](./RATE.md)) · **Realistic ceiling:** ~20–25% (written
fallback only) or ~45–55% (machine-readable graphic layer confirmed) · **Gap to ceiling:** ~2–37
pts — range determined by the graphic-layer probe · **Gap to Denmark (~96%):** ~78 pts ·
**Last updated:** 2026-07-24 · **Owner:** UNASSIGNED

---

## 1 — The ceiling: what "maximum" means here

Marseille's realistic ceiling is **binary** — it cannot be stated as a single number until the
`sig.ampmetropole.fr` graphic layer probe is completed:

- **If the graphic layer is machine-readable (GIS vector data):** ceiling **~45–55%** — the
  graphic-primacy resolver can be implemented as an API call; zone + graphic height + written
  fallback + BD TOPO produces a defensible fill for most parcels.
- **If the graphic layer is raster-only (scanned PDF plates, like Barcelona's historic plànols):**
  ceiling **~20–25%** — only the written-règlement fallback tier is implementable; every parcel
  where the graphic plan overrides the written text is a flagged refusal.

**This probe is the single gating action for Marseille.** No Phase 3 or later scope can be set
without it. Do not commit development resources to Marseille before this probe returns.

**What sets both ceiling variants:**
- Zone identification (GPU WFS) is already ~100% — this is fully in the baseline.
- FAR/COS is definitively N/A — no work needed.
- BD TOPO existing building heights (~90%) are free, national, and already in the baseline.
- The written règlement for UA/UB/UC zone families is one PDF (the PLUi Territoire 1 règlement,
  already live-confirmed with page-anchored URL via GPU `urlfic`) — one sourcing effort.
- The Euroméditerranée OIN boundary is an unresolved silent-accuracy risk: its derogating rules
  apply to a defined area of Marseille, but the boundary layer has not been found. Until found,
  any parcel inside the OIN receives the wrong rules — a correctness bug, not a coverage gap.

**Barcelona comparison (the closest structural analogue):** Barcelona's Pla Parcial height-on-
plànol problem is architecturally identical to Marseille's graphic-primacy situation. Barcelona's
resolution was a graphic-first resolver built after confirming the plànol layers were digitized.
Marseille's Phase 0 probe mirrors the exact same decision point Barcelona hit before committing the
Pla Parcial ingestion work.

---

## 2 — Phase tracker

| Phase | Goal | Unlocks | Rate: from→to | Effort | Status | Owner |
|---|---|---|---|---|---|---|
| **0** | Assess — GPU WFS zone_urba confirmed live for Marseille; full schema including `urlfic` with page anchors confirmed; GPU height-attribute absence confirmed; graphic-primacy rule characterised; RATE.md written | Honest baseline: ~18% confirmed; graphic-primacy as the ceiling-determining structural gap identified; graphic-layer probe as the gating next action | — → ~18% | Complete | VERIFIED | UNASSIGNED |
| **1** | **Graphic-layer probe:** probe `sig.ampmetropole.fr` / AMP geoserver for the graphic règlement (règlement graphique) — determine whether it is published as a machine-readable GIS vector layer or as raster-only (scanned plates/PDF) | The single ceiling-determining gate — outcome sets all subsequent scope | ~18% → ~18% (probe only) | Medium — one API probe + schema inspection + GetFeature | NOT STARTED | UNASSIGNED |
| **2** | Read PLUi Territoire 1 dispositions générales — confirm graphic-primacy text verbatim; confirm legal citation; record in `sources/SOURCES.md`; obtain human `VERIFICATION.md` sign-off. Read UA, UB, UC written height articles as the fallback tier. | L-449 provenance gate for the graphic-primacy rule and written fallback; prerequisite before any height can be shipped as a cited value. Can run in parallel with Phase 1. | ~18% → ~18% (provenance gate) | Low — 3–4 PDF sections | NOT STARTED | UNASSIGNED |
| **3 (GIS path)** | *IF Phase 1 confirms machine-readable graphic layer:* build graphic-primacy resolver KIND — attempt height resolution from graphic layer first; fall back to written règlement article only where the graphic layer is silent; flag Euroméditerranée OIN parcels as explicit refusals | Enables parcel-level height fills for parcels where the graphic layer has data; written fallback covers the remainder | ~18% → ~40–50% | High — new rule KIND; ~10–12 dev-days for precedence-resolution logic | NOT STARTED | UNASSIGNED |
| **3 (raster path)** | *IF Phase 1 confirms raster-only (scanned plates):* ship written-règlement fallback tier only with explicit graphic-primacy flag — "height per règlement écrit, subject to graphic plan; verify on plànol"; do not digitize | Written fallback is the only defensible tier; graphic-primary parcels are flagged, not filled | ~18% → ~20–22% | Low–Medium — written UA/UB/UC wiring only; no new KIND needed | NOT STARTED | UNASSIGNED |
| **4** | Find Euroméditerranée OIN (EPAEM) boundary GIS layer; wire as an explicit refusal zone (per the Barcelona clau-18 playbook — refuse until separately sourced) | Closes the silent-accuracy risk for OIN-interior parcels; converts a correctness bug to a detectable flag | ~40–50% (GIS path) or ~20–22% (raster path) → +2 pp | Medium — GIS layer search + ingestion | NOT STARTED | UNASSIGNED |
| **5** | Fix GPU WFS `wfs_sup:assiette_sup_s` GetFeature nationally; confirm ABF + PSMV (Vieux-Port / Panier) machine-queryable for Marseille | Heritage-zone parcels convert from "silent risk" to "detectable flag" | → +3 pp | Low | NOT STARTED | UNASSIGNED |
| **6** | *GIS path only:* wire graphic-layer height fills + written fallback + ABF flag → deliver `constructed` (amber) tier for AMP Territoire 1 | Marseille ceiling reached (~45–55%) | ~45–50% → ~45–55% | Medium — data wiring; KIND already built in Phase 3 | NOT STARTED | UNASSIGNED |

---

## 3 — The gap to Denmark (~96%)

**(a) The graphic-primacy rule is the permanent structural ceiling without a policy change.**
Denmark delivers a structured height field per plan polygon — no graphic override. Marseille's
PLUi explicitly establishes the graphic plan as the binding source. Even if the graphic layer is
machine-readable (GIS vector), any parcel where the graphic plan is silent falls back to the
written text — a two-step resolution that cannot be collapsed into a single API call. The ~45–55%
ceiling (GIS path) reflects this: there will always be a residual of parcels where resolution
requires both the graphic and written layers, plus a judgment about which applies.

**(b) Euroméditerranée OIN is a structural derogating zone.** The OIN EPAEM has derogating rules
under Article 29 that override the PLUi for its defined area. Until the OIN boundary is confirmed
as a machine-readable GIS layer and its specific rules sourced separately, any parcel inside the
OIN is a correctness risk. This is structurally identical to Barcelona's clau 18 (Olympic Village
/ specific-plan zones): the correct response is a flag and explicit refusal, not a PLUi fill.

**(c) AMP Territoire 1 ≠ all of Marseille.** Pays d'Aix (Conseil de Territoire separately
governed by a PLUi approved 5/12/2024) is a different planning document not covered by this pack.
A complete "Marseille metro" coverage would require a separate sourcing effort for Pays d'Aix —
a separate task, not an extension of this one.

**(d) PSMV risk in the historic core.** The Vieux-Port / Panier area is subject to a PSMV
(Plan de Sauvegarde et de Mise en Valeur), which overrides the PLUi for historic-fabric parcels.
Its boundary is not yet confirmed as machine-queryable in GPU. Until confirmed, PSMV-interior
parcels are a silent override risk — the PLUi fill may be wrong.

---

## 4 — Dependencies, blockers, and cross-jurisdiction reuse

**Hard dependencies:**
- **Phase 1 (graphic-layer probe) is the gating action for all subsequent phases.** The probe
  result determines whether Phase 3 is the GIS-resolver path (~10–12 dev-days new KIND) or the
  raster-fallback path (low effort, written text only). **Do not schedule or resource Marseille
  implementation work until Phase 1 completes.**
- **Phase 2 (L-449 gate) can run in parallel with Phase 1** — reading the dispositions générales
  and written zone articles is independent of the graphic-layer probe result.
- **Phase 3 (GIS path) requires a new rule KIND** (graphic-primacy resolver) before any graphic-
  layer height fills are possible. This KIND is analogous to the Barcelona graphic-primacy resolver
  built for Pla Parcial ingestion — check whether that KIND is reusable before writing a new one.
- **Phase 4 (OIN) is independent** and can run in parallel with Phases 3 and 5 — it does not
  depend on the graphic-layer probe result.

**Cross-jurisdiction reuse:**
- The GPU WFS zone-identification path, IGN PCI parcel ingestion, and BD TOPO® existing building
  heights are shared with Paris and Lyon — one build for all three French city packs.
- The graphic-primacy resolver KIND (Phase 3, GIS path) may reuse the Barcelona Pla Parcial
  graphic-first ingestion logic — the precedence-resolution pattern ("attempt graphic layer; fall
  back to written text where silent") is architecturally identical.
- The Euroméditerranée OIN refusal pattern is identical to the Barcelona clau-18 playbook
  (zone pointing at a separate instrument → explicit refusal until separately sourced). Reuse the
  same refusal-zone architecture.
- The L-449 clause-citation → human verification → `VERIFICATION.md` flow is identical for every
  sourced jurisdiction.
- LiDAR HD (Etalab 2.0) covers Marseille with near-certainty given it is a major metro — confirm
  with one tile-check before committing LOD2 compute.

**Governing documents:** C58 (fidelity/provenance) · ADR-0269 (curate-then-serve) · L-449
(human-verification gate) · Code de l'urbanisme · PLUi AMP Marseille-Provence Territoire 1
(approved 19/12/2019) · Article 29 (Euroméditerranée OIN derogation) · loi ALUR 2014 (COS
abolition).

---

*Model references: **Denmark** `../../../dk/` (ceiling, ~96%) · **Barcelona**
`../../../es/es-ct/08019-barcelona/` (graphic-primacy resolver pattern for Pla Parcial is the
direct analogue). Governing: **C58** · **ADR-0269** · **L-449**.*

*Last updated: 2026-07-24. Maintainer: UNASSIGNED.*
