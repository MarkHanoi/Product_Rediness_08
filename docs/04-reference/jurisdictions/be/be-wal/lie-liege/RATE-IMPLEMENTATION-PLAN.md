# Rate Implementation Plan — Liège (`be-wal-liege`) city

**Current rate:** ~0–2% (see [`RATE.md`](./RATE.md)) · **Realistic ceiling:** ~10–15% (if GCU with
numeric content confirmed); ~0–2% (if no GCU or qualitative-only GCU) ·
**Gap to ceiling:** ~8–15 pts (GCU path) or ~0 pts (no GCU — ceiling = current rate) ·
**Gap to Denmark (~96%):** ~81–96 pts ·
**Last updated:** 2026-07-24 · **Owner:** UNASSIGNED

---

## 1 — The ceiling: what "maximum" means here

Liège's realistic ceiling is **~10–15% if a GCU with numeric provisions is confirmed, or effectively
~0–2% if no GCU exists or the GCU is qualitative only**. This is the lowest ceiling of all three
Belgian cities — and the only case in this study where the ceiling itself is a research question,
not an engineering question.

**What sets the ceiling:**

Wallonia's plan de secteur (23 broad-category polygons adopted 1977–1987, still fully in force) is
the most complete regional coverage layer in this benchmark — no "unplanned land" anywhere — but it
carries zero dimensional data. The GRU is explicitly non-binding. *Bon aménagement des lieux* (CoDT
Art. D.IV.13) is the load-bearing mechanism for most specific envelope questions. There is no
region-wide numeric gabarit text comparable to Brussels' RRU Titre I, and no computable formula
comparable to H = P + 3.00 + D.

**The one path that raises the ceiling** is a Guide communal d'urbanisme (GCU) adopted by Liège
commune. A GCU can supply numeric height and coverage provisions for specific zones at the commune
level, layered on top of the plan de secteur affectation. Whether Liège has adopted a GCU, and
whether that GCU contains real numeric provisions (rather than qualitative design guidance), is
**NOT YET ASSESSED** — it is the prerequisite research task before any implementation phase can be
scoped.

**Denmark comparison:** Denmark's ~96% rests on Plandata delivering structured height and density
fields per plan polygon. Liège's gap is not a data-access problem (the plan de secteur WFS is more
modern and more accessible than Denmark's Plandata for a non-credentialed user). It is that the
planning instrument was never designed to contain those fields — and the one instrument that might
(the GCU) may not have been adopted.

**Barcelona comparison (pilot model):** Barcelona's climb used computed envelopes where structured
fields were absent. Wallonia has no computable rule equivalent to Barcelona's *edificabilitat* or
Brussels' H = P + 3.00 + D. The GCU, if numeric, would be the closest thing — discrete provisions
per zone type that can be looked up from the text, transcribed, and cited. This is a narrower path
than Barcelona's, and produces a lower ceiling.

---

## 2 — Phase tracker

| Phase | Goal | Unlocks | Rate: from→to | Effort | Status | Owner |
|---|---|---|---|---|---|---|
| **0** | Assess — endpoint/schema checks; write RATE.md; characterise the plan-de-secteur + bon-aménagement-des-lieux structure | Honest baseline: ~0–2% confirmed; structural gap characterised; GCU as the ceiling-determining research task identified | — → ~0–2% | Complete | VERIFIED | UNASSIGNED |
| **1** | **GCU research task:** confirm whether Liège commune has adopted a Guide communal d'urbanisme; if yes, obtain the text and determine whether it contains numeric height/coverage/setback provisions for any zones | The single gating question — determines the ceiling and all subsequent phase scope; if no GCU or qualitative GCU: ceiling stays at ~0–2% and Phases 2–4 do not apply | ~0–2% → ~0–2% (research only; rate unchanged) | Low (municipal publication search; Liège commune official site + Wallonia DGATLP records) | NOT STARTED | UNASSIGNED |
| **2** | Run WFS GetFeature against `LU.ZoningElement_pds` for a known Liège parcel; confirm end-to-end plan-de-secteur zone query; fetch AWaP heritage GetCapabilities + GetFeature for Liège area | Closes the "endpoint live but GetFeature untested" gap; confirms heritage overlay schema and coverage | ~0–2% → ~0–2% (probe only; zone label queryable, not a dimensional fill) | Low (endpoint already VERIFIED LIVE) | NOT STARTED | UNASSIGNED |
| **3** | If GCU confirmed with numeric provisions: read primary text; record per-field clause citations in `sources/SOURCES.md`; obtain human `VERIFICATION.md` sign-off | Fills the provenance gate for any GCU-derived numeric value — prerequisite for `estimated-ruleset` tier | ~0–2% → ~0–2% (provenance gate; rate unchanged) | Low–Medium (GCU text read + clause transcription) | NOT STARTED | UNASSIGNED |
| **4** | If GCU numeric provisions confirmed: build Liège instrument cascade (plan de secteur zone query → GCU numeric provision lookup → *bon aménagement des lieux* refusal for zones without GCU provision) | For parcels in zones with confirmed GCU numeric provisions: a cited, structured fill; for all other parcels: a correct, attributed refusal | ~0–2% → ~5–15% (GCU path; upper end depends on GCU zone coverage) | Medium — instrument cascade + GCU ingestion; requires Phases 1–3 | NOT STARTED | UNASSIGNED |
| **5** | Probe PICC building-footprint WFS and Wallonia LiDAR terrain product for field schema, coverage, and licence; integrate confirmed context-data sources | Firms up context-data layer (currently ~40% on stated basis) | ~5–15% → ~10–15% (ceiling; GCU path) | Low–Medium | NOT STARTED | UNASSIGNED |

---

## 3 — The gap to Denmark (~96%)

The gap is structural and largely irresolvable by data engineering alone:

**(a) *Bon aménagement des lieux* as the primary operative mechanism.** Denmark's Plandata delivers
a number per plan polygon. Wallonia delivers a zone label per parcel (structurally queryable), and
then routes the envelope question to a mandatory discretionary compatibility test. The correct output
for most Liège parcels is a *bon aménagement des lieux* refusal — permanently so, without a policy
change. This fraction of the denominator cannot be filled by any pipeline.

**(b) Plan de secteur vintage and coarseness.** 23 broad-category polygons for all of Wallonia,
adopted 1977–1987, were never designed to carry height or FAR. Raising the rate would require either
a new Wallonia-wide planning instrument (analogous to Denmark's Plandata) or the adoption of GCUs
with real numeric content in individual communes (an incremental path, commune by commune).

**(c) No provision-code catalogue.** Sweden's Planbestämmelsekatalog automates the step from
plan-provision codes to numeric meaning. Wallonia has no equivalent — any numeric provision in a GCU
must be transcribed individually with the L-449 human-verification gate.

**(d) GCU adoption is not centrally tracked.** Whether any given Wallonia commune has adopted a GCU
is confirmed only by consulting that commune's official publications. At scale (the full 262 Wallonia
communes), this is a per-commune research task — not a pipeline problem.

---

## 4 — Dependencies, blockers, and cross-jurisdiction reuse

**Hard dependencies:**
- **Phase 1 (GCU research) is the ceiling-determining gate.** No subsequent phase can be scoped or
  estimated without first confirming whether Liège has a GCU with numeric content. If the answer is
  no, Phases 3–5 do not apply, the ceiling stays at ~0–2%, and the implementation plan ends at
  Phase 2. **Do not commit development resources to Liège before Phase 1 completes.**
- **Phase 2 (GetFeature probe) is independent of Phase 1** — it can run in parallel; the plan de
  secteur WFS is already VERIFIED LIVE and the GetFeature call requires no GCU knowledge.

**Cross-jurisdiction reuse:**
- The federal CADMAP ingestion (parcel geometry) built for Brussels and Antwerp also serves Liège —
  one build, three-region benefit.
- The *bon aménagement des lieux* refusal vocabulary is architecturally the same as the Flanders
  "vrij" refusal — define both as variants of the `legal` refusal kind once and share across the
  three Belgian packs.
- The plan de secteur zone query (WFS GetFeature against `LU.ZoningElement_pds`) gives Liège's
  zone label (zone d'habitat, etc.) — not a dimensional fill, but a prerequisite for the GCU
  lookup path (GCU provisions are keyed by zone type). The same pattern applies at scale to all
  262 Wallonia communes, making this ingestion a shared Wallonia-wide component.
- The L-449 per-instrument sign-off flow (GCU clause transcription → human verification →
  `structured` tier) is the same flow used for Saudi's footprint clauses, Barcelona's plan packs,
  and every other sourced numeric value in this tree.

**Governing documents:** C58 (fidelity/provenance) · ADR-0269 (curate-then-serve) · L-449
(human-verification gate) · CoDT (Code du Développement Territorial; ex-CWATU 1984 → CoDT 2016,
reformed May 2025; Art. D.IV.13 *bon aménagement des lieux*) · loi spéciale 8-08-1980 (Wallonia
devolution).

---

*Model references: **Denmark** `../../../dk/` (ceiling, ~96%) · **Barcelona**
`../../../es/es-ct/08019-barcelona/` (pilot climb — per-instrument sourcing + L-449 gate mirrors
the GCU path). Governing: **C58** · **ADR-0269** · **L-449**.*

*Last updated: 2026-07-24. Maintainer: UNASSIGNED.*
