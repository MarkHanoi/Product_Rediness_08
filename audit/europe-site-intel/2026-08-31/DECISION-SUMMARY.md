# EUROPE SITE-INTEL AUDIT — FOUNDER DECISION SUMMARY (one page)

> 2026-08-31 · The 10 decisions REPORT.md asks of you. Each row: the decision, the
> recommendation, and where the evidence lives. Full argument: `REPORT.md` (sections cited);
> raw evidence: `lanes/*.md`.

| # | Decision | Recommendation | Evidence |
|---|---|---|---|
| 1 | **Architecture: lake / federation / hybrid?** | **Hybrid (Option C)** — query parcels+rules live, cloud-optimise bulky context to R2, store only derived envelopes+evidence. It is what PRYZM already runs; ratify it as doctrine. | REPORT §H.1; L7 §6; L1 §F.2 (masters freeze) |
| 2 | **Buildings: master dataset or federation?** | **Federation** — Overture backbone + national LoD2/cadastre override + EUBUCCO year/type joins; **adopt GERS as the conflation key**. Keep ODbL layers SEPARABLE (never merge into one DB) — the one architectural licence constraint. | REPORT §A.1.2, §G; L1 §F.2 |
| 3 | **Rule engine: adopt, adapt, or build?** | **Build the thin rule envelope (H); adopt four patterns** (JSON-Logic bodies, OpenFisca versioning, RASE annotation, state vocabularies). No adoptable engine exists — BCRL has no engine, OpenFisca has zero spatial users. | REPORT §L; L1 §G.8 |
| 4 | **Envelope engine: replace or extract-into-core?** | **Extract-into-core.** Nothing in government, OSS, or the market replicates it; 0/20 parcel chains state-served an envelope. Finish adoption: Seam-1 `envelopeToMassing`, never-overstate CI, SiteFrame. | REPORT §M, §R; L7 §3/§9; L6 §4.3 |
| 5 | **Rule packs: keep as TypeScript or migrate to data?** | **Migrate to the declarative format** (numbers/citations/predicates as data + typed evaluator). Biggest single refactor recommended; unlocks non-engineer authoring and country #16+. Pilot: Barcelona pack. | REPORT §L; L7 §2/§11 |
| 6 | **Country sequencing?** | **EE → NL → LT → PL (after 2026-11-30)**, DK corrections in parallel, then the SE/FI/NO/LU/LV/SI structured family, then document-rule countries (DE/FR/CH corpora first). **Immediate: request the free NL DSO API keys this week — it is a form.** | REPORT §S; L4 sequencing; L4 NL-1 |
| 7 | **Terrain: keep building the compiler?** | **Stop; trial Mapterhorn** (+ keep only the datum-lift and façade-rasant sampling, which are legal requirements). Also stop ES/FR nDSM differencing — the states pre-computed it (MDSnE, MNH LiDAR HD). | REPORT §H.3 rows 2–3; L6 §9; L3 ES-2/FR-4 |
| 8 | **Versioning ("what applied on 2025-01-01")?** | **Fund it now** — valid_from/valid_to on Rule+Plan, point-in-time resolution, wired through the existing (unwired) attribution layer. It exists nowhere in PRYZM; four states already serve the raw material. | REPORT §K; L7 §10; L4 #2 |
| 9 | **UK (and market posture)?** | UK = **Product-A only** (discretionary system structurally caps envelopes; crowded aggregators). The pan-EU parcel-to-envelope seat is EMPTY and time-bound (Zoneomics→Forma is the closing mechanism) — the differentiation everywhere is provenance-traced deterministic envelopes, not data breadth. | REPORT §D; L5 UK; L6 §3.13 |
| 10 | **Open items only you can close** | (a) Clarify or drop the three names that resolve to nothing: **"Polis" (FR), "Swiss Zoning API", "BZOdigital"**; (b) authorise fetching four licence texts verbatim (Catastro Licencia.pdf, OME2, geoportal.lt, MS GlobalML LICENSE — the last is a live lane contradiction); (c) confirm BUPi RGG openness; (d) Network-tab check to delete the old tile proxies. | REPORT §A.4 #1/#6, Appendix |

**Standing principle applied throughout (BRIEF §34):** own as little raw data infrastructure as
possible — reuse data, standards, OSS; federate; cache only when justified; AI for
interpretation, deterministic geometry; applicability is the core intelligence layer;
development potential is the product.

**Cost shape to hold in mind:** infra is ~€100/mo at 1k parcels/day and ~€15–40k/mo at 1M/day —
the scaling constraint is rule sourcing + human validation, not compute (REPORT §Q).

**Team shape:** 4–6 engineers (2 core, 1–2 adapters, 1 extraction/AI, 0.5 infra) + the
validation loop (REPORT §S/T-Q20).
