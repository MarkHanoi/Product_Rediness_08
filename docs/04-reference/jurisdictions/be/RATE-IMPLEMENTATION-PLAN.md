# Rate Implementation Plan — Belgium (`be`) national

**Current rate:** ~10–14% (see [`RATE.md`](./RATE.md)) · **Realistic ceiling:** ~20–30% (without
policy change); ~50–60% (with a provision-code catalogue in one or more regions) ·
**Gap to ceiling:** ~6–20 pts (structural ceiling) · **Gap to Denmark (~96%):** ~82–86 pts ·
**Last updated:** 2026-07-24 · **Owner:** UNASSIGNED

---

## 1 — The ceiling: what "maximum" means here

Belgium's realistic ceiling without a policy change is **~20–30%** — substantially below Denmark
(~96%) and below Germany (~28% today but with a clearer upward path via XPlanGML Stufe 2). The
gap is not a data-engineering problem: Belgium's zone-boundary layer is arguably *more* complete
than Denmark's (no unplanned-land category in any region since the 1970s–80s). The gap is that
**Belgium's underlying legal design, in two of its three regions, treats the exact height/FAR number
as something to be decided case-by-case rather than published in advance**.

Flanders' *goede ruimtelijke ordening* and Wallonia's *bon aménagement des lieux* are not rare
derogation safety valves — they are the load-bearing mechanism for most envelope questions, layered
on top of every permit including inside numerically-specified plans. Until a structured provision
catalogue analogous to Sweden's Planbestämmelsekatalog is adopted in at least one region, no amount
of data engineering raises the rate above the ~20–30% band; the numbers literally do not exist as
machine-readable structured fields in the source systems.

**What sets the ~20–30% ceiling:**
1. Parcel geometry and zone-boundary hit are near-universal (90–95%) — already close to their
   ceiling; no meaningful rate gain available here.
2. Height/FAR/setbacks are absent as structured fields in all three regional systems — every
   point of structured fill beyond today's baseline requires either (a) discovering that individual
   RUP/PPAS features carry populated numeric attributes (the §3.6 open question) or (b) successfully
   computing Brussels' RRU Titre I formula from live geometric inputs.
3. The federal CADMAP building-height attribute, if confirmed, is a free nationally-consistent
   building-height source — but it measures *existing* buildings, not *permitted* envelopes.

**Denmark comparison:** Denmark hits ~96% because its national Plandata database exposes zone type,
density metric, and height as machine-readable structured fields per plan polygon. Belgium has the
zone type (near-universally); it is missing the density metric and height in all three regions
because those numbers live in PDF regulations or in the discretionary judgment of a permitting
official, not in a database field.

**Barcelona comparison (pilot climb model):** Barcelona's climb from low base to constructed
envelopes relied on a computable rule (edificabilitat from block geometry) that could be derived
algorithmically even without a structured field. Belgium's equivalent "computable without a field"
candidate is Brussels' RRU Titre I formula (H = P + 3.00 + D) — the one region where the rule,
once the bot-detection block is resolved, could be computed from geometric inputs (rue width P,
parcel depth D). This is Brussels' path, not a national path.

---

## 2 — Phase tracker

| Phase | Goal | Unlocks | Rate: from→to | Effort | Status | Owner |
|---|---|---|---|---|---|---|
| **0** | Assess — live endpoint/schema checks; write RATE.md | Honest baseline: ~10–14% confirmed | — → ~10–14% | Complete | VERIFIED | UNASSIGNED |
| **1** | Resolve Brussels bot-detection block; confirm PRAS/RRU/RRUZ layer schema and licence terms live from Belgian-IP deployment | PRAS zone query + RRU Titre I instrument-priority check operational; prerequisite for all Brussels pack work | ~10–14% → ~10–14% (access unblocked; rate unchanged until Phase 2) | Low–Medium (infrastructure) | NOT STARTED | UNASSIGNED |
| **2** | Run WFS GetFeature probes: (a) any Flemish RUP feature for numeric height/FAR attribute; (b) any Brussels PPAS feature for numeric content; (c) federal CADMAP building sublayer for height/storey attribute | Closes the single largest remaining unknown — confirms whether structured numeric fields exist at all in any regional plan feature | ~10–14% → ~12–18% (if positive hits found) or confirms ceiling | Medium (probe design + access workarounds) | NOT STARTED | UNASSIGNED |
| **3** | Build Brussels RRU Titre I formula encoder: new rule KIND (context-relative H = P + 3.00 + D); instrument-priority check (PPAS/RRUZ/PAD > RRU); live PRAS zone query | First region with a computable envelope path; Brussels ~5–10% → ~20–30% for parcels under RRU Titre I default | ~12–18% → ~15–22% (Belgium blended; Brussels accounts for ~11% of population) | High — new rule KIND; requires Phase 1 complete | NOT STARTED | UNASSIGNED |
| **4** | Build Flanders RUP ingestion: DSI WFS access (via `mercator.vlaanderen.be` or alternative); gewestplan/RUP classifier; Art. 7.4.2/2 nullification check; "vrij" refusal output | Flanders parcels with explicit numeric RUP provisions reach the fill denominator; "vrij" parcels get a correct reasoned refusal instead of silence | ~15–22% → ~18–27% (blended; Flanders ~57% of population but low fill fraction per RUP) | High — four-step instrument cascade; "vrij" refusal KIND | NOT STARTED | UNASSIGNED |
| **5** | Confirm Wallonia GCU adoption for Liège; if confirmed, extract numeric provisions; build plan-de-secteur zone query against live WFS | Liège parcels under a GCU numeric provision reach the denominator; all Wallonia parcels get a correct plan-de-secteur zone answer + bon-aménagement-des-lieux refusal | ~18–27% → ~20–30% (ceiling without policy change) | Medium (Liège GCU research) + Low (plan de secteur WFS already live) | NOT STARTED | UNASSIGNED |
| **6** | Policy-dependent: a Belgian region adopts a provision-code semantic catalogue mapping plan-provision codes to numeric values | Structural ceiling rises from ~20–30% to ~50–60%; equivalent of Sweden's Planbestämmelsekatalog | Political/administrative change — not currently underway in any region | BLOCKED (external) | UNASSIGNED |

---

## 3 — The gap to Denmark (~96%)

Denmark delivers ~96% because its national Plandata service exposes zone type, FAR/density metric,
and height as structured fields in every plan polygon — machine-readable without reading a PDF.
Belgium's gap has three structural components:

**(a) Numbers in PDFs, not structured fields (the dominant gap).** Both Flanders' RUP
voorschriften and Brussels' RRU Titre I exist as PDF regulations with inline prose formulas. Even
where a number exists, it is not in an API-queryable attribute on the plan feature. This requires
either a transcription pipeline (PDF → structured field, with the L-449 human-verification gate)
or a formula-computation path (Brussels' H = P + 3.00 + D). No Belgian region has automated this.

**(b) Discretion as the legal operative standard (structural, not data-engineering).** Flanders
and Wallonia treat the compatibility judgment as the primary operative mechanism — not a fallback.
The correct answer for a large fraction of clicks in these two regions is "no numeric ceiling
published; discretionary review applies" — a correct refusal, not a data gap. This fraction cannot
be filled by better engineering; it can only be filled if the regions adopt structured provision
catalogues (policy change, not roadmap item).

**(c) Three independent regional systems, three independent ingestion pipelines.** Germany has 16
Länder but one shared BauNVO taxonomy and one XPlanGML schema. Belgium has three regions with no
shared taxonomy, schema, or portal. Every layer (zoning, heritage, building, LiDAR) must be
ingested three times independently. The only genuine cross-region efficiency is the federal
cadastre (CadGIS/CADMAP) — built once, used for all three regions' parcels.

---

## 4 — Dependencies, blockers, and cross-jurisdiction reuse

**Prerequisites before any phase can ship:**
- **Phase 1 (Brussels bot-block):** prerequisite for all Brussels pack work. Until the PRAS WFS
  is reachable live, no Brussels instrument-priority check or PRAS zone query can run.
- **Phase 2 (GetFeature probe):** prerequisite for knowing whether any structured numeric field
  exists anywhere in Belgium's regional plan features. If the probe returns no populated
  height/FAR attributes anywhere, the ceiling estimate drops from ~20–30% to ~15–20%, and Phase 4
  scope narrows to "instrument cascade + refusal output" only — no numeric fill path.
- **Phase 5 (Liège GCU):** the GCU research task must complete before any Liège numeric rate
  estimate can be made; the current rate is correct at ~0–2% regardless.

**Cross-jurisdiction reuse opportunities:**
- The federal CADMAP ingestion (Phase 2 prerequisite) is a one-time build that serves all three
  regions' parcel geometry — the most direct parallel to the Spain Catastro ingestion.
- Brussels' H = P + 3.00 + D formula encoder (Phase 3) is architecturally related to Saudi's
  `resolveSaudiSetbacks` (a pure function of geometric inputs, not a static lookup). The resolver
  pattern from `sa-ruh-riyadh` applies directly here; the new rule KIND is still required because
  the inputs differ (P = rue width, D = parcel depth vs. Saudi's single street width).
- Flanders' `lu_hov_*` nullification-tracking layer (Phase 4) has no direct parallel in other
  studied jurisdictions — it is the only known case where the data publisher itself tracks which
  plan provisions are statutorily voided. Once ingested, it provides a rare automated nullification
  check rather than a per-provision manual gate.
- The Art. 7.4.2/2 "clichering" temporal-validity check logic (Flanders) may reuse the plan-date
  comparison logic from any other jurisdiction that tracks instrument vintage.

**Governing documents:** C58 (fidelity/provenance) · ADR-0269 (curate-then-serve) · L-449
(human-verification gate) · VCRO Art. 4.3.1 + Art. 7.4.2/2 · CoDT Art. D.IV.13 · CoBAT/RRU
Titre I (Brussels) · loi spéciale 8-08-1980 + loi spéciale 12-01-1989 (regional devolution).

---

*Model references: **Denmark** `../dk/` (ceiling, ~96%) · **Barcelona**
`../es/es-ct/08019-barcelona/` (pilot climb). Governing: **C58** (fidelity/provenance),
**ADR-0269** (curate-then-serve), **L-449** (human-verification gate).*

*Last updated: 2026-07-24. Maintainer: UNASSIGNED.*
