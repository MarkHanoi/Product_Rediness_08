# Rate Implementation Plan — Braga (`pt-03 / 0303-braga`) city

**Current rate:** ~0% (see [`RATE.md`](./RATE.md)) · **Realistic ceiling:** ~40–55% ·
**Gap to ceiling:** ~40–55 pts · **Gap to Denmark (~96%):** ~96 pts ·
**Last updated:** 2026-07-24 · **Owner:** UNASSIGNED

> **Why ceiling ~40–55% — higher than Lisboa or Porto?** Braga has no unique engine blockers
> (no créditos de construção schema gap, no moda da cércea rule kind required, no UNESCO ZEP
> complexity). Its PDM is tractable: once cadastral geometry is confirmed and the OCR pipeline is
> built, the entire fill-rate triplet (zone + density + height) can be sourced from the PDM
> regulamento without waiting on schema amendments. The ceiling is capped by PDF-only delivery and
> the absence of a national numeric floor (no BauNVO §17 equivalent) — not by structural engine
> gaps. If cadastral coverage is confirmed and full PDM sourcing is completed, Braga is expected to
> be Portugal's highest-rate city.

---

## 1 — The ceiling: what "maximum" means here

Braga is Portugal's **pilot model city** — the analogue of Barcelona as the first-mover proving
the climb. It was selected because it has no unique engine features that block pack authoring, two
numeric values are already partially cited, and mid-size municipalities trend better for cadastral
coverage than the two largest cities.

**The ceiling (~40–55%)** is set by the PDF-only nature of PDM numeric values. Unlike Denmark,
where zone code, density, and height are typed structured fields in national Plandata, Braga's PDM
values are in a PDF regulamento. Raising the rate above ~0% requires: (a) confirmed parcel
geometry, (b) an OCR / rule-extraction pipeline reading the PDM PDF, and (c) L-449 human
verification for each extracted value. Once these exist, Braga can reach a Barcelona-like ceiling
for its urban residential and commercial categories.

The ceiling is not higher than ~55% because:
- Not all PDM categories will have complete numeric parameters (the RJUE "no precise instrument"
  fraction — zones where full licensing applies — is unknown for Braga but could cover a portion
  of its land; these zones produce a reasoned refusal, not a rate contribution)
- The "cota de soleira" definition (which affects the índice calculation) has not been read and
  may introduce per-parcel measurement complexity
- LiDAR height (existing building) and PDM cércea (allowed height) are separate data streams; the
  nDSM height module feeds context, not rule delivery

**Ceiling model — Denmark (~96%):** Denmark proves near-complete automation is possible when
numbers are structured data. Braga cannot reach ~96% without a structural change in how the
Portuguese government publishes PDM values (PDF → structured API). That is outside PRYZM's control.

**Pilot model — Barcelona (~48%):** Barcelona climbed from a low base through phased sourcing.
Braga mirrors this shape: read one category, verify it, pack it, then scale to additional
categories. The ~40–55% ceiling is achievable through Braga's phased climb, making it the
**proving ground** for the Portuguese OCR pipeline and the L-449 gate.

---

## 2 — Phase tracker

| Phase | Goal | Unlocks | Rate: from→to | Effort | Status | Owner |
|---|---|---|---|---|---|---|
| **0** | Confirm Braga cadastral regime (DICOFRE 0303 via DGT SNIC); run SNIT WFS probe (GetCapabilities + GetFeature for Braga point); confirm DGT LiDAR endpoints live (`cdd.dgterritorio.gov.pt`) | Parcel geometry status known; SNIT attribute schema known; height layer confirmed; baseline rate derivable | ~0% → TBD | ~0.75 dev-days (per NEXT.md estimate) | NOT STARTED | UNASSIGNED |
| **1** | Read Braga PDM regulamento from SNIT PDF: upgrade índice 1.20 + cércea 7.5 m to VERIFIED-PRIMARY (governing article + document date + URL); discover full categoria list; source afastamentos for "espaços residenciais" | First VERIFIED-PRIMARY numeric values for any Portuguese municipality; "espaços residenciais" pack skeleton ready; full category roadmap established | TBD → TBD | ~0.5–1 dev-day | NOT STARTED | UNASSIGNED |
| **2** | Build SNIT zone-polygon ingestion + PDM OCR/rule-extraction pipeline + L-449 human-verification gate; source all remaining Braga PDM categorias (índice + cércea + afastamentos per categoria); add SOURCES.md rows for each value | First non-zero fill rate for any Portuguese city; OCR pipeline operational and reusable for Porto/Lisboa | TBD → TBD (estimate: ~35–45% for covered categorias) | High (pipeline); Medium (Braga categories, ~8–12 dev-days) | NOT STARTED | UNASSIGNED |
| **3** | Probe DGPC Atlas live for Braga heritage assets (ZGP/ZEP); confirm nDSM height module working with DGT LiDAR inputs; re-derive RATE.md from confirmed live checks | Heritage overlay complete; height layer confirmed; first VERIFIED rate measurement for Braga | TBD → ~40–55% (ceiling) | Medium | NOT STARTED | UNASSIGNED |

---

## 3 — The gap to Denmark (~96%)

**(a) Numeric values are PDF-only — the primary gap.** Braga's PDM regulamento is a PDF document.
Denmark's Plandata delivers zone code, density, and height as typed machine-readable fields.
Closing this gap requires the OCR pipeline + L-449 gate. The pipeline is buildable; the gate caps
throughput. Until the pipeline exists, Braga's rate cannot move above ~0% regardless of how well
the zone polygon layer and parcel geometry are confirmed.

**(b) No national numeric floor for cross-checking.** Germany's BauNVO §17 provides national
ceiling GRZ/GFZ values — any extracted number that exceeds them is a red flag. Portugal's DR
15/2015 provides zone taxonomy but no numeric ceilings. Extracted Braga values cannot be
sanity-checked against a national standard; the L-449 human reviewer must catch errors without a
numeric anchor. This is a process risk, not a data availability risk — but it makes the L-449 gate
more critical for Portugal than for Germany.

**(c) RJUE "no precise instrument" fraction — unknown for Braga.** A portion of Braga's land may
fall into the RJUE "full licenciamento prévio" category — areas where no precise urbanistic
parameters exist and the correct output is a C58 §1.13 refusal, not a numeric envelope. Portugal
has no public map equivalent to Germany's XPlanung absence map for §34 land. The fraction is
unknown until the PDM Planta de Ordenamento is read in full. This fraction, whatever it is,
contributes 0% to the fill rate regardless of pipeline effort.

---

## 4 — Dependencies, blockers, and cross-jurisdiction reuse

**Blockers (in priority order):**
1. **Cadastral regime confirmation** (P0) — gates all parcel work; Braga is most likely of the
   three cities to be CGPR-covered, but this must be confirmed, not assumed
2. **Governing article for the two CONVERGENT-SECONDARY values** — the 1.20 índice and 7.5 m
   cércea cannot be served at `confidence: structured` until the PDM article is read and cited in
   `sources/SOURCES.md`; this is the cheapest unblock in Portugal
3. **OCR pipeline + L-449 gate** — shared with PT national; must exist before any value is served;
   Braga's tractability makes it the ideal first city to prove the pipeline

**What Braga proves for the rest of Portugal:**
- The SNIT WFS probe at Braga establishes the field structure for all subsequent PT SNIT queries —
  Porto and Lisboa use the same national portal. Run this once, document the schema.
- The OCR pipeline built for Braga's PDM is the shared tool for all 308 Portuguese municipalities.
  Do not build it as a Braga-specific tool — design with per-PDM configuration (category names,
  article numbering, glossary terms). Braga's tractability (no unique mechanisms) makes it the
  ideal proving ground before the pipeline faces Lisboa's créditos de construção or Porto's moda
  da cércea.
- The L-449 gate process, run for the first time on Braga values, establishes the verification
  workflow for all subsequent Portuguese cities. Document the verification artefacts carefully.
- The DGT LiDAR nDSM probe and DGPC Atlas probe confirmed for Braga apply nationally — do not
  re-run per-city; build the national-scope readers from the start.

**Cross-jurisdiction reuse:**
- SNIT zone-polygon ingestion: national — built once, used by Porto and Lisboa.
- OCR/rule-extraction pipeline: national — Braga is the pilot; design for reuse.
- nDSM height module: shared ES + FR + PT — do NOT one-off for Braga.
- DGPC Atlas heritage reader: national — ZGP/ZEP query built for Braga covers all PT cities.
- RJUE "no precise instrument" zone identification pattern: if developed for Braga, reusable as
  a Portugal-wide classification tool against SNIT PDM coverage vs. parcel.

---

*Model references: **Denmark** `../../dk/` (ceiling, ~96%) · **Barcelona**
`../../es/es-ct/08019-barcelona/` (pilot climb). Governing: **C58** (fidelity/provenance),
**ADR-0269** (curate-then-serve), **L-449** (human-verification gate).*
