# Rate Implementation Plan — Paris (`75056`) city

**Current rate:** ~35% (see [`RATE.md`](./RATE.md)) · **Realistic ceiling:** ~55–60% ·
**Gap to ceiling:** ~20–25 pts · **Gap to Denmark (~96%):** ~61 pts ·
**Last updated:** 2026-07-24 · **Owner:** UNASSIGNED

---

## 1 — The ceiling: what "maximum" means here

Paris's realistic ceiling is **~55–60%** — the highest of the three studied French cities, but
still 36–41 pts below Denmark (~96%). The ceiling is set by the gabarit formula complexity and the
PSMV/ABF overlay risk, not by a data-access problem. All the raw material exists (three live GIS
layers, GPU WFS, BD TOPO) — the bottleneck is building the engine KIND to use it.

**What sets the ~55–60% ceiling:**
- `plub_filet` (20,644 records) covers most Paris street segments. Once the UG.10 decoding table
  is read, this converts from ~0% usable to ~35–40% usable — the single largest rate lever.
- Emprise au sol (UG.9) and setbacks (UG.6/7) are in one PDF, one read — adds ~13 pp.
- PSMV (Vieux-Port / Marais / Montmartre sectors) and ABF perimeters (~700 classified monuments
  in Paris) are not yet machine-queryable — they represent a "potentially wrong" residual for the
  historic core that keeps the ceiling below 100% until the SUP overlay is confirmed queryable.
- The gabarit formula itself (H = P + 3.00 + D from a computed block-level reference surface)
  requires ADR-0274 — a new engine KIND that does not currently exist. Without this KIND, the
  `plub_filet` codes cannot produce parcel-level numbers even once decoded.

**Denmark comparison:** Denmark's ~96% delivers a number per plan polygon. Paris's `plub_filet`
delivers a letter per street segment — the geometry is more granular than Denmark's plan polygons
(~60% street coverage vs polygon coverage), but the letter requires a decode step + a formula
computation that Denmark's direct-numeric fields do not. One ADR and one PDF section close that gap
for most of Paris; the remainder is the historic overlay risk.

**Lyon comparison:** Lyon's `pluhauteur` delivers absolute metres directly — no decode step, no
formula. Paris's `plub_filet` is denser spatially but requires more engineering to produce the same
output. Lyon is cheaper per new-fill unit despite a lower headline rate.

---

## 2 — Phase tracker

| Phase | Goal | Unlocks | Rate: from→to | Effort | Status | Owner |
|---|---|---|---|---|---|---|
| **0** | Assess — three opendata.paris.fr height layers live-confirmed; `plub_filet` haut codes M/K/C/B/G confirmed; RATE.md written | Honest baseline: ~35% confirmed; structural gap characterised; ADR-0274 as the gating KIND identified | — → ~35% | Complete | VERIFIED | UNASSIGNED |
| **1** | Probe whether the "plan des hauteurs" (`plub_hauteur`) / hauteur plafond is also published as a full GIS layer vs PDF atlas plates only; probe `plub_filet` bbox coverage completeness | Resolves the ±6–8 dev-day uncertainty before committing to hauteur-plafond ingestion | ~35% → ~35% (probe only) | Low — one direct URL + WFS count probe | NOT STARTED | UNASSIGNED |
| **2** | Read PLU bioclimatique UG.10 — extract `haut` letter decoding table; read UG.9 (emprise au sol); read UG.6/7 (implantation/setbacks) verbatim; record clause citations in `sources/SOURCES.md`; obtain human `VERIFICATION.md` sign-off | Fills the L-449 provenance gate — prerequisite for using any PLU bioclimatique article as a cited source | ~35% → ~35% (provenance gate; rate unchanged) | Low — 3 PDF sections + clause transcription | NOT STARTED | UNASSIGNED |
| **3** | Fix GPU WFS `wfs_sup:assiette_sup_s` GetFeature endpoint; confirm ABF sub-type code for Paris; confirm PSMV (`secteur sauvegardé`) machine-queryable boundary | SUP overlay structurally queryable — converts ~700 Paris classified-monument ABF perimeters from "silent risk" to "detectable flag" | ~35% → ~37% | Low | NOT STARTED | UNASSIGNED |
| **4** | Build ADR-0274 reference-surface + gabarit engine KIND: (a) block-ring dissolve → reference surface computation; (b) gabarit formula `H = P + 3.00 + D` as a function of prospect distance and street width; (c) `plub_filet` code → formula mapping | The gating KIND — without this, `plub_filet` cannot produce parcel-level height numbers even with the UG.10 decode table ingested | ~37% → ~37% (KIND build; rate unchanged) | High — 4–5 dev-days ADR; 10–12 dev-days implementation | NOT STARTED | UNASSIGNED |
| **5** | Wire `plub_filet` decoded codes + ADR-0274 gabarit KIND to produce parcel-level height fills; wire UG.9 emprise au sol; wire UG.6/7 setback articles as cited refusals for parcels without a formula result | Paris moves from ~35% to ~52–55% (plub_filet coverage × decode × gabarit + emprise + setbacks) | ~37% → ~52–55% | Medium — data wiring; KIND already built in Phase 4 | NOT STARTED | UNASSIGNED |
| **6** | Source Paris-specific overlays: fuseaux de protection (UG.10 specific sectors), maisons/villas secteur, Montmartre secteur; wire graphic overlay ingestion if the hauteur-plafond plan is confirmed as a GIS layer in Phase 1 | Closes the overlay-specific sectors; raises rate toward ~55–60% ceiling | ~52–55% → ~55–60% | Medium — 6–8 dev-days overlay ingestion (contingent on Phase 1 graphic-layer probe) | NOT STARTED | UNASSIGNED |

---

## 3 — The gap to Denmark (~96%)

**(a) ADR-0274 KIND is the gating item.** Denmark's plan polygons deliver a number. Paris's
`plub_filet` delivers a coded letter keyed to a formula. Without ADR-0274, the 20,644 street-
segment records are useless for parcel-level height computation. This KIND is the single largest
investment and the prerequisite for all Phase 5–6 rate gains.

**(b) Reference-surface computation is geometrically non-trivial.** The "surface de nivellement de
l'îlot" is not the street level or the parcel centroid elevation — it is a geometric construction
derived from the block ring. Computing it requires dissolving parcels to block boundaries, then
deriving a planar reference surface. This is a bespoke algorithm — not a lookup, not a formula with
simple inputs.

**(c) PSMV / ABF residual.** Paris has ~700 classified monuments, each generating a 500 m ABF
perimeter. For parcels inside those perimeters, the ABF sign-off is discretionary and case-by-case
— not data. Even with ABF perimeters machine-queryable, the correct output for those parcels is a
flag ("ABF perimeter — sign-off required") rather than a numeric fill. This fraction of Paris
parcels permanently contributes to the gap.

**(d) `UGSU`/`UV`/`N` zones are separately scoped.** This plan covers `UG` (the dominant private-
land zone). `UGSU` (large urban services), `UV` (green urban), and `N` (natural/forest) each
require separate sourcing tasks. Their combined land area is smaller than `UG`, but they represent
additional sourcing scope not costed in this plan.

---

## 4 — Dependencies, blockers, and cross-jurisdiction reuse

**Hard dependencies:**
- **Phase 2 (PDF reads) must precede Phase 5 (wiring)** — the L-449 human-verification gate
  requires the clause citations to be recorded before any PLU bioclimatique article is shipped as
  a value. Do not wire UG.9/10 without Phase 2 sign-off.
- **Phase 4 (ADR-0274 KIND) must precede Phase 5** — the gabarit KIND is the prerequisite for
  producing any numeric height from `plub_filet`. The KIND build is independent of Phase 2
  (it can start once ADR-0274 is approved, without waiting for UG.10 to be read).
- **Phase 3 (SUP overlay fix) is independent** — run in parallel with Phases 1–2.
- **Phase 1 (graphic-layer probe) must complete before Phase 6 scoping** — the dev-day estimate
  for Phase 6 swings by ±6–8 days depending on whether the hauteur-plafond plan is a GIS layer
  (cheap ingestion) or PDF atlas plates (expensive digitizing task).

**Cross-jurisdiction reuse:**
- The ADR-0274 gabarit KIND (H = P + 3.00 + D from a reference surface) is architecturally
  identical to Brussels' RRU Titre I formula (same formula, same prospect-distance input). If the
  Brussels KIND is built first as part of the Belgium pack, Paris may reuse its resolver pattern
  with a different reference-surface computation — reducing the Phase 4 estimate by ~3–5 dev-days.
- The GPU WFS zone-identification path, the IGN PCI parcel ingestion, and the BD TOPO® building-
  height layer are all shared with Lyon and Marseille — one build for all three French city packs.
- The L-449 clause-citation → human verification → `VERIFICATION.md` flow is the same process used
  for every sourced jurisdiction; no Paris-specific gate.

**Governing documents:** C58 (fidelity/provenance) · ADR-0269 (curate-then-serve) · ADR-0274
(reference-surface + gabarit KIND — TBD / proposed) · L-449 (human-verification gate) · Code de
l'urbanisme · PLU bioclimatique de Paris (4 zones: UG, UGSU, UV, N; articles UG.6/7/9/10).

---

*Model references: **Denmark** `../../../dk/` (ceiling, ~96%) · **Lyon**
`../../fr-ara/69123-lyon/` (cheapest French city — start here before Paris). Governing: **C58** ·
**ADR-0269** · **ADR-0274** (proposed) · **L-449**.*

*Last updated: 2026-07-24. Maintainer: UNASSIGNED.*
