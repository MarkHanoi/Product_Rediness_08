# Rate Implementation Plan — Lisboa (`pt-11 / 1106-lisboa`) city

**Current rate:** ~0% (see [`RATE.md`](./RATE.md)) · **Realistic ceiling:** ~35–45% ·
**Gap to ceiling:** ~35–45 pts · **Gap to Denmark (~96%):** ~96 pts ·
**Last updated:** 2026-07-24 · **Owner:** UNASSIGNED

> **Ceiling note:** Lisboa's ceiling is estimated at ~35–45% — higher than the national average
> (~25–35%) if CML's LOD2/3 dataset and DGPC heritage layers are confirmed integrable, and if
> cadastral geometry is confirmed for Lisboa's urban core. The ceiling is capped below ~50% by
> PDF-only numeric values (OCR pipeline required), the créditos de construção mechanism (new C58
> schema type required), and the ongoing PDM revision risk. It may not be set precisely until the
> cadastral gate and the SNIT WFS probe are complete (Phase 0).

---

## 1 — The ceiling: what "maximum" means here

Lisboa's ceiling is shaped by two competing forces. On the **upside**: CML's council-wide 3D model
(LOD2/3, IF the licence is confirmed) and the nationally-queryable DGPC heritage layers give Lisbon
a richer context layer than any city in this study except perhaps Copenhagen. If the CML model is
redistributable and cadastral geometry is confirmed, Lisboa's context-data quality is exceptional.

On the **downside**: the numeric planning layer is PDF-bound (same as the national position), the
créditos de construção mechanism requires a C58 schema amendment before FAR can be correctly
represented, and the cadastral regime for Lisboa's urban core is the single highest-risk item in the
study — it may sit entirely outside CGPR coverage (which was rural-focused and south of the Tagus).

**Ceiling model — Denmark (~96%):** Denmark achieves ~96% because its numbers are structured fields
in national Plandata. Lisboa cannot reach that ceiling until its PDM numeric values are converted
from PDF to structured data and cadastral parcel geometry is confirmed complete. Neither condition
is met today.

**Pilot model — Barcelona (~48%):** Barcelona's phased climb (registry → per-clau rule packs →
block-derived construction → refusal vocabulary) is the shape to mirror. For Lisboa, the analogous
phases are: cadastral confirmation → OCR extraction of PDM categories → créditos overlay →
heritage overlay → verified measurement.

Lisboa's realistic ceiling (~35–45%) could reach the Barcelona range if cadastral confirmation is
positive and the CML 3D model is redistributable. If cadastral coverage is absent for Lisboa's
urban core, the ceiling drops toward ~10–15% (context-layer-only, no queryable parcel rules) until
alternative geometry sources are confirmed.

---

## 2 — Phase tracker

| Phase | Goal | Unlocks | Rate: from→to | Effort | Status | Owner |
|---|---|---|---|---|---|---|
| **0** | Confirm cadastral regime (DICOFRE 1106 via DGT SNIC); confirm CML 3D model licence; run SNIT WFS probe for Lisboa zone layer; check PDM revision status via SNIT | Honest baseline; establishes whether parcel geometry exists; unblocks or re-routes pipeline design | ~0% → TBD | ~1 dev-day total | NOT STARTED | UNASSIGNED |
| **1** | Read PDM Lisboa regulamento: source full categoria de espaço list; confirm "altura da edificação" definition (not "cércea"); source índice + afastamentos per categoria | First Lisboa-specific verified numeric values; pack skeleton possible | TBD → TBD | ~2–4 dev-days | NOT STARTED | UNASSIGNED |
| **2** | Build/reuse OCR pipeline + L-449 gate; ingest zone polygon (SNIT WFS) + extracted PDM numeric values per categoria | First non-zero fill rate for Lisboa parcels in covered categories | TBD → TBD | High (pipeline shared with PT national) | NOT STARTED | UNASSIGNED |
| **3** | Draft and get approved C58 `transferableRights` overlay type; source créditos de construção mechanism (PDM Arts. 84/88/89); integrate seismic-risk condicionante spatial layer | FAR correctly represented for Lisboa; no longer understates achievable floor area | TBD → TBD | Medium (ADR) + Medium (sourcing) | NOT STARTED | UNASSIGNED |
| **4** | Probe DGPC Atlas live; source ZGP/ZEP for Lisboa's classified monuments + Carta Municipal de Património; verify CML 3D model integration; re-derive RATE.md | Heritage overlay + context layer complete; first VERIFIED rate measurement for Lisboa | TBD → ~35–45% (ceiling) | Medium | NOT STARTED | UNASSIGNED |

---

## 3 — The gap to Denmark (~96%)

**(a) Parcel geometry — Lisboa's highest-risk gap.** Denmark has a complete national parcel layer.
Lisboa's cadastral regime is unconfirmed; CGPR coverage is concentrated south of the Tagus and in
rural areas. If Lisboa's urban core lacks formal cadastre, the parcel-geometry gap is worse than any
other city in this study. The Carta Cadastral OGC API (planned 2025, not yet confirmed live) is the
most important event to watch — if it delivers complete national parcel coverage, this gap collapses.

**(b) Numeric values are PDF-only.** Lisboa's índice and altura da edificação values are in the PDM
regulamento PDF. Denmark's values are structured fields. Portugal has no national ceiling to
cross-check extracted values against (DR 15/2015 gives taxonomy, not numbers). The OCR pipeline +
L-449 gate are required before any extracted value can be served at `confidence: structured`.

**(c) Lisboa-unique mechanisms not in the current schema.** Créditos de construção (tradeable FAR
rights) and the seismic-risk condicionante have no Denmark/Germany/France analogue implemented in
PRYZM today. Until the C58 `transferableRights` type is added, any Lisboa pack understates
achievable floor area — a systematic error that is worse than a missing value (a missing value is
explicit; an understated one is silent).

---

## 4 — Dependencies, blockers, and cross-jurisdiction reuse

**Blockers (in priority order):**
1. **Cadastral regime confirmation** (P0) — gates all parcel pipeline work
2. **CML 3D model licence** — gates LOD2/3 context layer (no zoning rate impact but critical for
   context completeness)
3. **PDM revision status** — source values from the CURRENT version; check SNIT before committing
4. **C58 `transferableRights` schema amendment** — must precede any Lisboa FAR pack
5. **OCR pipeline + L-449 gate** — shared with PT national; must exist before any value is served

**Cross-jurisdiction reuse:**
- SNIT zone-polygon ingestion built for Braga (the recommended first city) reuses for Lisboa
  directly — same national portal, same WFS structure once confirmed.
- DGPC Atlas heritage probe is national — one reader covers Lisboa, Porto, and Braga.
- nDSM height module (DGT LiDAR DSM−DTM) is the same shared module as Spain and France; do not
  one-off it for Lisboa.
- If the `transferableRights` C58 overlay type is added for Lisboa, it may be reusable for any
  jurisdiction with tradeable development rights (not currently identified elsewhere in this study,
  but future-proof the interface).

---

*Model references: **Denmark** `../../dk/` (ceiling, ~96%) · **Barcelona**
`../../es/es-ct/08019-barcelona/` (pilot climb). Governing: **C58** (fidelity/provenance),
**ADR-0269** (curate-then-serve), **L-449** (human-verification gate).*
