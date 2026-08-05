# Adeje (INE 38001, Tenerife, Canarias) — Founder Envelope-Capability Research

**Status: NOT IMPLEMENTED — queued for Canarias Sprint 1 (after the Fly.io production deploy)**

Source: founder-supplied research (ChatGPT-assisted deep research), captured and organized into
house documentation format on 2026-08-04. This document reproduces and structures the founder's
pasted research verbatim; it is **not** an independently re-verified PRYZM research pass (compare
the Cartagena/Lorca docs in `es-mc`, which are live-verified). No new fact-finding, citation
verification, or code was performed to produce this document. Adeje has **no code presence** in the
repo yet — no rule pack, no dispatch entry, no verified flag.

---

## 1. Mission statement (as given)

Implement PRYZM legally grounded envelope generation for Adeje (Spain, Canarias, Tenerife, INE
38001). Target: `ADEJE_ENVELOPE_VERIFIED=true`. Acceptance: `UNKNOWN=0%`. Every buildable parcel
must produce a computed envelope OR a legally justified refusal. Never: estimated height, generic
zoning assumptions, transferred rules from neighbouring municipalities.

---

## 2. Phase-by-phase implementation prompt (as given, for Sprint 1)

**Phase 1 — Jurisdiction structure.** `jurisdictions/es-cn/38001-adeje/` with `sources/` (`SIPU/`,
`PGOU/`, `NORMATIVA/`, `FICHAS/`, `ALINEACIONES/`, `SECTORES/`, `VERIFICATION.md`) and `findings/`
(`CAPABILITY-AUDIT.md`, `BLOCKER-AUDIT.md`, `COVERAGE-AUDIT.md`).

**Phase 2 — Planning corpus acquisition.** PGOU Adeje, adaptaciones/modificaciones, ordenanzas
urbanísticas, normas generales, normas particulares, planes parciales, estudios de detalle,
unidades de actuación. For each document record: name, source, approval, legal_status,
applicable_zones.

**Phase 3 — SIPU ingestion.** `providers/sipuShapefile.ts`, reusing the El Sauzal/Telde pattern.
Input `EDIF.shp/.dbf/.mdb`. Output `{zoneCode, geometry, instrument}`.

**Phase 4 — Adeje zoning resolver.** `packages/site-parcel-data/src/rulepacks/esAdeje.ts`. Resolver
flow: parcel → SIPU polygon → classification → PGOU zone → rule article.

**Phase 5 — Extract envelope rules.** Height (max floors/height, cornice, ridge), Occupancy (max
occupation %, max footprint), Buildability (edificabilidad, m2t/m2s, volume limits), Setbacks
(front/side/rear). **Special tourism zones are critical for Adeje**: explicit handling for hotel
areas, tourist residential, coastal developments, protected landscapes, mixed-use zones — no
assumption that residential rules apply.

**Phase 6 — Coastal constraint integration.** Adeje likely requires DPMT coastal boundary,
servidumbre de protección, Ley de Costas constraints, protected areas as overlay providers
(`constraints/coastal.ts`, `environmental.ts`, `heritage.ts`). Rule: constraints modify
buildability, do not replace zoning.

**Phase 7 — Parcel coverage audit.** `scripts/auditAdejeCoverage.ts`. Output `{municipality:"Adeje",
parcelsAnalysed, envelopeGenerated, legalRefusal, unknown, coverage}`. Hard failure: `unknown>0`.

**Phase 8 — Certification gate.** Only after audit, enable `ADEJE_ENVELOPE_VERIFIED=true`, add
`SIG-ADEJE-001`.

**Expected difficulty table (as given):** SIPU routing Low · Geometry Low-medium · PGOU extraction
Medium-high · Tourism zones High · Coastal constraints Medium · 100% proof Medium-high.

**Strategic value (founder framing):** if Adeje succeeds, Canarias becomes El Sauzal (reference
small municipality) → Telde (reference medium municipality) → Adeje (reference high-value tourism
municipality) → Arona (next) → Canarias rollout. Adeje is the correct next Canary benchmark because
it tests whether PRYZM can handle real estate investment markets, not just municipal completeness.

---

## 3. Founder's forensic assessment — four passes, increasingly detailed

### Pass 1

> "Adeje is a strong candidate, but I cannot prove 100% envelope coverage yet. The evidence supports
> high probability, not certification."

**Proven (per founder):**
1. Official SIPU planning package exists — structured SIPU dataset for the approved PGOU (geometry,
   planning layers, documentation index, downloadable SIPU package) via the Canarias open-data
   catalogue (source: datos.canarias.es, "Aprobación Definitiva de Plan General de Ordenación de
   Adeje" SIPU package). This means parcel → planning geometry → zone identification is realistic.
2. Adeje has active planning instruments beyond the PGOU — both good and dangerous: the dataset
   includes PGOU, modifications, Planes Parciales, Estudios de Detalle, urban development units.
   Examples: AU-11 Torviscas, AU-12 San Eugenio, SN3 Los Menores, modification files (source:
   datos.gob.es). Meaning Adeje is not a simple municipality — it is a **planning stack**.

The 100% question chain: CAT parcel → SIPU polygon → active planning instrument → zone code →
numeric parameters → envelope. Adeje already has the first 3 steps; the unknown is zone code →
complete numeric rule extraction.

**Biggest risk areas:**
- Risk 1 — Tourism urbanism (Costa Adeje, San Eugenio, Torviscas, Playa Paraíso, Callao Salvaje
  likely contain tourist accommodation regulations, special plans, development units, older
  approved instruments — increases transcription complexity).
- Risk 2 — Derived planning instruments (unlike El Sauzal's mostly-direct PGOU rules, Adeje = PGOU
  + Plan Parcial + Estudios de Detalle + Modificaciones + sector rules; resolver must know which
  instrument wins).
- Risk 3 — Coastal constraints (need PGOU envelope + Ley de Costas restrictions + protected areas
  as overlay providers).

**Probability table (pass 1):** El Sauzal 85-90% · Telde 80-90% · Adeje 65-75% · Arona 55-65% ·
Santa Cruz 40-55% · Las Palmas 30-50%.

Recommended execution order: 1. Finish El Sauzal 100% (best chance), 2. Finish Adeje (high
commercial value), 3. Arona (similar tourism logic), 4. Santa Cruz (capital complexity).

**Verdict:** GO — but first task should be `ADEJE_INSTRUMENT_RESOLVER` (identify legally
controlling planning instrument per parcel), not the envelope calculator — once solved, the
envelope engine is mostly reusable.

### Pass 2 (deeper)

> "Adeje is probably buildable — but the 100% envelope hypothesis depends on solving the instrument
> hierarchy, not on missing data."

Adeje is closer to a "development ecosystem" than a normal municipality. Evidence strength:
planning data exists (approved PGOU documentation, SIPU structured package, downloadable
FIP/SIPU datasets, planning documentation index via datos.canarias.es) — eliminates the biggest
Spanish failure mode ("no machine-readable planning source exists").

**Key discovery:** Adeje is not one rule system — it is PGOU general zones + tourist urbanizations +
partial plans + studies of detail + modifications + coastal constraints + protected areas (e.g.
Plan Parcial SN3 Los Menores, per datos.gob.es). Resolver cannot simply do parcel → PGOU zone →
height; needs parcel → active planning instrument resolver → controlling document → zone → numeric
envelope.

Updated probability: before deeper inspection 65-75%, after deeper inspection 80%+ potential,
because the difficult part (SIPU, legal corpus, planning hierarchy, structured downloads) already
exists — remaining challenge is normalization.

**Blocker list (pass 2):**
- **BLOCKER 1** — Instrument precedence: need `resolveAdejePlanningInstrument()` answering for
  every parcel: does PGOU control? which PP? which modification? which ED? — output `{instrument:
  PGOU|PLAN_PARCIAL|ESTUDIO_DETALLE|MODIFICACION, documentId, approvalDate, legalReference}`.
- **BLOCKER 2** — Tourist zones (Costa Adeje, Torviscas, San Eugenio, Playa Paraíso, Callao Salvaje
  likely not simple residential envelopes; need special rule classes `TOURIST_RESIDENTIAL`,
  `HOTEL`, `APARTMENT_TOURIST`, `MIXED_USE`).
- **BLOCKER 3** — Coastal overlay (envelope + DPMT + servidumbre + environmental constraints;
  architecture: calculate envelope → apply restrictions → final buildable envelope; never
  coastal = no-calculation).

**What to build first (pass 2):** not the envelope calculator — the first deliverable is
`ADEJE_PLANNING_GRAPH` (example: parcel belongs to PP Costa Adeje approved 1998, zone CT-3, rules
article 45, height 6 floors, occupancy 40%, source PDF page 122).

Implementation prompt given ("ADEJE INSTRUMENT RESOLVER FIRST"): create
`packages/site-parcel-data/src/rulepacks/esAdeje/` with `esAdejeInstrumentResolver.ts`,
`esAdejeZoneResolver.ts`, `esAdejeRules.ts`; resolver chain parcel → planning polygon intersection →
instrument precedence ranking → zone classification → numeric parameters; priority 1. specific
approved development instrument, 2. approved modification, 3. PGOU detailed zoning, 4. refusal;
never inherit neighbouring rules, estimate parameters, or fallback generic; output `{status:
RESOLVED|REFUSAL, instrument, zone, article, parameters, source}`; create
`ADEJE_COVERAGE_AUDIT.md` tracking total buildable parcels, resolved instruments, resolved
envelopes, legal refusals, unknown; acceptance `unknown=0`.

Revised order: 1. El Sauzal → prove clean 100%, 2. Adeje → prove commercial complexity, 3. Arona →
replicate tourism model, 4. Santa Cruz → capital test.

### Pass 3 (deepest)

> "Adeje is NOT a normal Canary build. It is probably the hardest 'high-value' Canary municipality
> after Arona. Good news: Adeje can probably reach very high envelope coverage. Bad news: a naive
> 100% engine will fail. The reason is legal instrument layering, not missing GIS."

**Forensic model:** ADEJE = Base PGOU + Sector revisions + Planes Parciales + Estudios de Detalle +
Modificaciones menores + Coastal/tourism constraints + Special development areas. The official
planning catalogue confirms multiple independent instruments: PGOU Adeje, Plan Parcial SN3 Los
Menores, AU-11 Torviscas documentation, AU-12 San Eugenio modifications, sector
revisions/modifications (source: datos.gob.es).

**Key discovery:** the engine should not start with parcel → zone → height (will break); it needs
parcel → LEGAL INSTRUMENT RESOLVER (PGOU/PP/ED/modification) → CONTROL DOCUMENT → ZONE → PARAMETERS
→ ENVELOPE.

**Land classification by buildability probability:**
- **Class A** — Existing urban consolidated (Adeje casco, existing residential areas): 95-100%
  probability, PGOU rules should dominate.
- **Class B** — Tourist urbanizations (Costa Adeje, Torviscas, San Eugenio, Playa Paraíso): 80-95%,
  rules exist but distributed through instruments.
- **Class C** — Development sectors (SN3 Los Menores, SO sectors, newer developments): 70-90%, need
  instrument resolver.
- **Class D** — Coastal/protected land: variable, need explicit refusal logic — a refusal is NOT
  failure (example: parcel in protected coastal strip → output REFUSAL, reason Ley de Costas
  constraint, source document/article — this counts as covered).

**Real 100% definition for Adeje:** do NOT measure "100% envelopes generated" (impossible because
some land legally cannot build) — measure "**100% parcels classified**" meaning
envelope + legal refusal = no unknown.

**New architecture proposal:** `esAdejeInstrumentGraph.ts` — not just a resolver, a graph. Example
JSON: `{parcel:"A123", instruments:[{type:"PGOU",priority:1},{type:"PLAN_PARCIAL",priority:2},
{type:"ESTUDIO_DETALLE",priority:3}], activeInstrument:"AU12", source:"AU12 modification 2026"}`.
Priority rules: specific approved instrument → sector instrument → detailed study → modification →
PGOU, but validated legally not assumed.

**Critical research tasks before coding:**
- Task 1 — Inventory every SIPU package (produce `ADEJE_INSTRUMENT_INDEX.json`, e.g.
  `[{"name":"PGOU","coverage":"municipal"},{"name":"AU12 San Eugenio","coverage":"partial"},
  {"name":"SN3 Los Menores","coverage":"sector"}]`).
- Task 2 — Spatial conflict test: for every parcel, count intersecting instruments (0=blocker,
  1=easy, 2+=hierarchy required).
- Task 3 — Rule extraction: for every instrument extract height, floors, occupancy, buildability,
  setbacks, alignment.

**Revised score table (pass 3):** Data availability 95% · Geometry 90% · Legal corpus 95% ·
Automation difficulty 60% · 100% coverage chance 80-85%.

Implementation order: 1. Adeje instrument graph, 2. Instrument coverage audit, 3. Zone resolver,
4. Rule pack, 5. Envelope generator, 6. Certification.

**Final verdict (pass 3):** GO — Adeje is worth doing, but the deliverable is "the first PRYZM
Canary municipality proving multi-instrument urbanism", not "another municipality". If Adeje works,
Arona becomes much easier because the architecture is already solved.

---

## 4. Honest framing — proven vs. hypothesis

| Claim | Status |
|---|---|
| SIPU/PGOU package exists for Adeje, published via datos.canarias.es | Founder-asserted, single-source cited — **not independently re-verified by PRYZM** |
| Multiple planning instruments (AU-11 Torviscas, AU-12 San Eugenio, SN3 Los Menores) exist and overlap parcels | Founder-asserted from datos.gob.es catalogue listing — instrument *names* are cited, spatial overlap counts are not verified |
| Numeric coverage probability (65-90% across the three passes) | Founder's own evolving estimate, explicitly not a measured result |
| Instrument-precedence resolver is the correct first build, not the rule pack | Founder's architectural recommendation, not implemented |
| `UNKNOWN = 0%` coverage | **Not proven** — no code exists yet for Adeje; this is the outcome to be produced by Sprint 1, not a current state |
| Code state | No `esAdeje.ts` rule pack, no dispatch entry, no verified flag exist in the repo today |

---

## 5. Next action

Per the founder: do not start with the envelope calculator. Build `ADEJE_INSTRUMENT_RESOLVER` /
`esAdejeInstrumentGraph.ts` first (planning-instrument precedence and spatial-conflict inventory),
then the zone resolver, then the rule pack, then coverage audit, then certification
(`ADEJE_ENVELOPE_VERIFIED=true`, `SIG-ADEJE-001`) — in that order, per Sprint 1 scope.

**Status: NOT IMPLEMENTED — queued for Canarias Sprint 1 (after the Fly.io production deploy)**
