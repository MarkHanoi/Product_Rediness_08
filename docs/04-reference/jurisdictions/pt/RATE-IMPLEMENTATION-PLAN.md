# Rate Implementation Plan — Portugal (`pt`) national

**Current rate:** ~0% (see [`RATE.md`](./RATE.md)) · **Realistic ceiling:** ~25–35% ·
**Gap to ceiling:** ~25–35 pts · **Gap to Denmark (~96%):** ~96 pts ·
**Last updated:** 2026-07-24 · **Owner:** UNASSIGNED

> **Why ceiling ~25–35%, not higher:** Portugal's numeric planning values (índice, cércea,
> afastamentos) are confirmed PDF-only in every PDM regulamento — no structured machine-readable
> equivalent exists nationally. Raising the rate requires an OCR / rule-extraction pipeline plus the
> L-449 human-verification gate. Even with that pipeline, the rate is capped by parcel geometry
> fragmentation (~134/308 municípios covered) and the absence of any national numeric ceiling
> (unlike BauNVO §17 for Germany). Portugal's realistic ceiling is below France (~22%) on the
> present infrastructure and would only exceed France if the OCR pipeline is built AND cadastral
> coverage is confirmed for target cities. A ceiling of ~25–35% is achievable for
> cadastral-confirmed cities with full PDM sourcing; the national ceiling is lower until the
> remaining 174 no-cadastre municípios are addressed.

---

## 1 — The ceiling: what "maximum" means here

Portugal is **PDF-bound** for its numeric planning values. The SNIT portal (Portugal's GPU
equivalent) returns zone polygons and PDF links — it does not deliver structured numeric attributes
for índice de utilização, cércea, or afastamentos. DR 15/2015 provides a national zone-category
taxonomy but attaches no numeric ceilings (unlike Germany's BauNVO §17). This places Portugal
firmly in the **Scenario B** structural position: ceiling capped until an OCR / rule-extraction
pipeline and the L-449 human-verification gate are built.

**Ceiling model — Denmark (~96%):** Denmark's national Plandata delivers zone code, numeric
density, and height as machine-readable structured fields. That is the proof that ~96% is reachable
when a country fully digitises its planning rules. Portugal is far from this: its numeric values
are locked in municipal PDFs, and its parcel geometry layer is itself fragmented. The Denmark
ceiling is not achievable for Portugal without a structural digital-transformation of PDM publishing
that is outside PRYZM's control.

**Pilot model — Barcelona (~48%):** Barcelona demonstrates the phased climb — registry, per-clau
packs, block-derived construction envelopes, refusal vocabulary. Portugal should mirror this phase
shape: start with the most tractable city (Braga), source one category, build the extraction
infrastructure, then scale to additional categories and cities. Mirror the **shape**, not the
numbers.

**Portugal's realistic ceiling (~25–35%):** bounded by three structural facts:
1. **PDF-only numeric values** — OCR pipeline + L-449 gate are required before any numeric field
   can be served at `confidence: structured`. This pipeline is buildable but has non-trivial effort.
2. **Fragmented parcel geometry** — ~134/308 municípios have cadastral coverage; 174 have none.
   For no-cadastre municipalities, even a fully-sourced PDM produces no automatable answer without
   a polygon to attach it to. The ceiling for those cities is 0% until cadastral coverage exists
   or the Carta Cadastral OGC API expands.
3. **Per-PDM formula variation** — unlike Germany (national §20 BauNVO formula for GFZ), Portugal
   has no national definition of "área de edificação." Even the formula for the density metric must
   be sourced per municipality, multiplying the OCR effort by the number of cities targeted.

The ceiling rises to ~35–50% for individual well-researched cities (Braga is the best candidate)
if cadastral confirmation is obtained and full PDM sourcing is completed. Lisboa and Porto face
additional unique mechanisms (créditos de construção, moda da cércea) that further complicate their
individual ceilings.

---

## 2 — Phase tracker

| Phase | Goal | Unlocks | Rate: from→to | Effort | Status | Owner |
|---|---|---|---|---|---|---|
| **0** | Confirm cadastral regime for Braga (DICOFRE 0303) via DGT SNIC; run SNIT WFS probe (GetCapabilities + GetFeature for Braga point); write/update RATE.md for Braga | First measurable rate for any Portuguese city; honest ceiling for Braga established | ~0% → TBD | ~0.75 dev-days | NOT STARTED | UNASSIGNED |
| **1** | Read Braga PDM regulamento (SNIT PDF): upgrade índice 1.20 + cércea 7.5 m from CONVERGENT-SECONDARY to VERIFIED-PRIMARY; discover full category list; add SOURCES.md rows with governing articles | First pack-ready values for Braga "espaços residenciais"; unblocks Braga pack | ~0% → TBD | ~1–2 dev-days | NOT STARTED | UNASSIGNED |
| **2** | Build SNIT zone-polygon ingestion + PDM OCR/rule-extraction pipeline + L-449 human-verification gate; source all Braga PDM categories (índice + cércea + afastamentos per categoria) | First non-zero fill rate for Braga; OCR pipeline reusable for all Portuguese cities | TBD → TBD (Braga ceiling estimate: ~40–55%) | High (pipeline); Medium (Braga categories ~8–12 dev-days) | NOT STARTED | UNASSIGNED |
| **3** | Confirm Lisboa and Porto cadastral regimes; probe DGPC Atlas heritage layers live; confirm DGT LiDAR endpoints; source Porto PDM (after `fabricDerivedHeight` C58 amendment); source Lisboa PDM (after `transferableRights` C58 amendment) | Porto and Lisboa packs; heritage overlay; terrain layer confirmed | TBD → TBD | High | NOT STARTED | UNASSIGNED |
| **4** | Scale OCR pipeline to remaining target cities; re-derive national RATE.md from confirmed live checks | National rate rises toward ceiling | TBD → ~25–35% (ceiling) | High | NOT STARTED | UNASSIGNED |

---

## 3 — The gap to Denmark (~96%)

Three structural facts separate Portugal from the 96% Denmark ceiling, each requiring a different
kind of work:

**(a) Numeric values are PDF-only — the primary structural gap.** Denmark's national Plandata
delivers zone code, density, and height as typed, queryable fields. Portugal's SNIT delivers a
polygon and a PDF link. Closing this gap requires building an OCR / rule-extraction pipeline that
reads Portuguese PDM regulamentos, extracts numeric parameters per category, and passes each
extracted value through the L-449 human-verification gate before it can serve at
`confidence: structured`. This is a buildable pipeline — analogous to France's position — but it
is not trivial, and the verification gate caps throughput. Until this pipeline exists, the rate
cannot rise above ~0% regardless of how well the zone polygon layer is built.

**(b) Parcel geometry is fragmented — Portugal's unique structural gap vs. France and Germany.**
France and Germany both have complete national parcel geometry (PCI-Express and ALKIS respectively),
so the fill-rate question there is "how many parcels have a queryable rule?" In Portugal, the prior
question is "how many parcels have a queryable geometry at all?" With 174 of 308 municípios having
no cadastro predial, and CGPR's rural focus leaving major city urban cores uncertain, the national
parcel geometry gap alone caps the ceiling below what France or Germany could achieve with the same
OCR effort. The Carta Cadastral OGC API (planned 2025, not yet confirmed live) could collapse this
gate if it goes live with national coverage — this is the single highest-leverage event to watch.

**(c) Per-PDM formula variation — no national numeric sanity-check.** Germany's BauNVO §17
provides national ceiling GRZ/GFZ values that a municipality cannot exceed — a backstop that allows
cross-municipality sanity-checking of extracted values. Portugal's DR 15/2015 provides category
names but no numbers. Even the formula for what counts toward índice de edificação is per-PDM.
This means OCR extraction must handle formula variation, not just value variation, and no national
check exists to catch extraction errors. The L-449 human-verification gate becomes even more critical
than in jurisdictions with national numeric anchors.

---

## 4 — Dependencies, blockers, and cross-jurisdiction reuse

**Hard dependencies (must resolve in order):**
- Cadastral regime confirmation per city (Phase 0) gates ALL parcel-level pipeline work. Do not
  design or build any parcel-geometry pipeline before this is confirmed.
- L-449 (human-verification gate) is mandatory for any value extracted via the OCR pipeline before
  it can be served at `confidence: structured`. No OCR-extracted number may bypass this gate.
- ADR-0269 (curate-then-serve): do not serve any PDM value that has not been verified against a
  citable governing article in SOURCES.md.
- C58 §2.2 amendment (new `fabricDerivedHeight` GeometricRule kind) is required before any Porto
  pack touching moda da cércea zones can be authored. Porto RATE.md cannot move above ~0% for
  those zones until this amendment is approved.
- C58 overlay schema addition (new `transferableRights` overlay type) is required before any
  Lisboa pack covering créditos de construção can be complete. Lisbon FAR will be understated
  without this.

**Current blockers:**
- SNIT WFS GetCapabilities not run — cannot design SNIT ingestion without confirmed field names
- DGT SNIC cadastral coverage per city unconfirmed — Braga DICOFRE 0303, Lisboa 1106, Porto 1315
  all need direct confirmation (not assumed from national coverage statistics)
- DGT LiDAR endpoints not live-probed — `cdd.dgterritorio.gov.pt` not confirmed live
- Lisbon CML 3D model licence unverified — hard blocker for Lisbon context layer (LOD2/3)
- DGT LiDAR RMSE-Z unpublished — cannot assign confidence tier to height data until DGT formal
  accuracy specification is obtained

**Cross-jurisdiction reuse:**
- The SNIT PDF → OCR / rule-extraction pipeline, once built, is reusable for all 308 Portuguese
  municípios. Do not build it as a Braga-specific tool — design the interface generically with
  per-PDM configuration (category names, article numbering patterns, glossary terms).
- The nDSM height module (DSM−DTM, 90th-percentile per footprint) is the SAME shared module as
  Spain (L-511c) and France (L-512b). PT feeds different DGT inputs. Do NOT one-off it per country.
- The DGPC Atlas heritage layer probe, once confirmed live, covers all Portuguese municipalities.
  Build one national heritage reader (ZGP/ZEP/ZNA), not per-city instances.
- The cadastral coverage confirmation (which CGPR/SiNErGIC/no-cadastre regime applies per
  município) should be done as a batch for all 308 municipalities once the DGT coverage list is
  obtained — not one city at a time.
- Pattern comparison: France's GPU pattern (zone polygon + PDF → OCR extraction) maps onto SNIT.
  If an apicarto-style pattern is confirmed for SNIT, the France adapter logic may port directly.

---

*Model references: **Denmark** `../dk/` (ceiling, ~96%) · **Barcelona**
`../es/es-ct/08019-barcelona/` (pilot climb). Governing: **C58** (fidelity/provenance),
**ADR-0269** (curate-then-serve), **L-449** (human-verification gate).*
