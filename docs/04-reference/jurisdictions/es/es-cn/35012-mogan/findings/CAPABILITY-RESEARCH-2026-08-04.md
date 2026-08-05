# Mogán (INE 35012, Gran Canaria, Canarias) — Founder Envelope-Capability Research

**Status: NOT IMPLEMENTED — queued for Canarias Sprint 1 (after the Fly.io production deploy)**

Source: founder-supplied research (ChatGPT-assisted deep research), captured and organized into
house documentation format on 2026-08-04. This document reproduces and structures the founder's
pasted research verbatim; it is **not** an independently re-verified PRYZM research pass (compare
the Cartagena/Lorca docs in `es-mc`, which are live-verified). No new fact-finding, citation
verification, or code was performed to produce this document. Mogán has **no code presence** in the
repo yet — no rule pack, no dispatch entry, no verified flag.

---

## 1. Mission statement (as given)

Implement PRYZM legally grounded buildable-envelope capability for Mogán (Spain, Canarias, Gran
Canaria, INE 35012). Primary objective: `MOGAN_ENVELOPE_VERIFIED=true` with `UNKNOWN=0%`. Every
parcel must return a computed envelope OR a legally grounded refusal — never generic estimates,
inherited neighbouring rules, undocumented assumptions, or silent fallback.

**Architecture constraints (explicit, as given):** DO NOT create `CanariasEnvelopeEngine.ts`,
`GranCanariaEngine.ts`, or `MoganSpecialEngine.ts`. Use existing architecture: `registry.ts` →
`siteDispatch.ts` → jurisdiction resolver → instrument resolver → rule pack → envelope calculation
→ L-449 certification. Reuse `packages/site-parcel-data` providers (`sipuShapefile.ts`,
`arcgisRest.ts`, overlay providers), `l449CertificationGates.ts`.

---

## 2. Phase-by-phase implementation prompt (as given, for Sprint 1)

**Phase 1 — Jurisdiction package.** `jurisdictions/es-cn/35012-mogan/` with `sources/` (`SIPU/`,
`GRAFCAN/`, `PGOU/`, `NORMAS/`, `PLANES_PARCIALES/`, `PLANES_ESPECIALES/`, `ESTUDIOS_DETALLE/`,
`MODIFICACIONES/`, `ALINEACIONES/`, `COSTA/`, `VERIFICATION.md`) and `findings/`
(`SOURCE-AUDIT.md`, `INSTRUMENT-COVERAGE.md`, `RULE-EXTRACTION.md`, `BLOCKER-AUDIT.md`,
`FINAL-COVERAGE.md`).

**Phase 2 — Acquire official planning corpus.** General planning (Plan General/Normas
Subsidiarias, urban regulations, zoning maps). Sector instrument priority targets: Puerto Rico,
Amadores, Taurito, Puerto de Mogán, Arguineguín, Loma de Pino Seco. Collect Plan Parcial, Special
Plans, Modifications, Detailed Studies for each.

**Phase 3 — Planning instrument registry.**
`packages/site-parcel-data/src/rulepacks/esMoganInstrumentRegistry.ts`. `MoganPlanningInstrument`
schema: `{id, name, type: PGOU|PLAN_PARCIAL|PLAN_ESPECIAL|ESTUDIO_DETALLE|MODIFICACION,
approvalDate, geometrySource, documentSource, priority}`.

**Phase 4 — Parcel instrument resolver.** `esMoganInstrumentResolver.ts`,
`resolveMoganInstrument(parcel)` → `{parcelId, instrumentId, instrumentType, zoneCode, legalSource,
confidence: verified|partial}`. Instrument precedence: highest legal specificity wins — 1. Plan
Especial, 2. Plan Parcial, 3. Estudio de Detalle, 4. Approved Modification, 5. General Plan, 6.
Legal refusal. Every decision must produce `{reason, source, article}`.

**Phase 5 — SIPU/GRAFCAN resolver.** `providers/esMoganSipu.ts`. Input parcel polygon, output
`{planningArea, instrumentId, zoneCode, geometryConfidence}`. Do not depend only on live services —
support offline package + cached geometry, following the Telde/El Sauzal pattern.

**Phase 6 — Rule pack extraction.** `rulepacks/esMogan.ts`. `MoganEnvelopeRule` schema:
`{instrument, zoneCode, landUse: residential|tourist|hotel|mixed|commercial, maxHeight?,
maxFloors?, occupancy?, buildability?, setbacks?: {front?,rear?,side?}, alignment?,
sourceDocument, sourceArticle}`.

**Phase 7 — Tourism classification model.** Explicit categories `TOURIST_HOTEL`,
`TOURIST_APARTMENT`, `RESIDENTIAL`, `MIXED_TOURISM_RESIDENTIAL`, `COMMERCIAL`. Never assume tourist
apartment = residential unless legally documented.

**Phase 8 — Priority pilot areas before municipality-wide rollout.**
- Pilot 1 — Puerto Rico (Plan Parcial → envelope; validate height/occupancy/setbacks/buildability).
- Pilot 2 — Taurito (special tourism instrument → envelope; validate tourism-specific rules,
  special plan precedence).
- Pilot 3 — Amadores (coastal tourism + terrain; validate coastal overlays, slope restrictions).

**Phase 9 — Constraint providers.** `constraints/esMogan/` with `moganCoastal.ts`,
`moganProtectedAreas.ts`, `moganTerrain.ts`. Output `{constraintType, geometry, legalReference}`.

**Phase 10 — Envelope resolver.** `rulepacks/resolveMoganEnvelope.ts`. Pipeline: parcel →
instrument resolver → zone resolver → rule pack → geometry generator → constraint providers →
envelope/refusal → certification. Output `{status: ENVELOPE|LEGAL_REFUSAL, geometry?, height?,
volume?, sources[], trace[], refusalReason?}`.

**Phase 11 — Coverage audit.** `scripts/auditMoganCoverage.ts`. Output `{municipality:"35012",
totalParcels, buildableParcels, envelopes, legalRefusals, unknown}`. Acceptance: `unknown=0`.

**Phase 12 — Certification gate.** Only after `unknown=0`, enable `MOGAN_ENVELOPE_VERIFIED=true`,
add `SIG-MOGAN-001`. Evidence package: source document, article reference, instrument, zone,
calculation trace, geometry result.

**Final deliverable:** `MOGAN-100-PERCENT-ENVELOPE-REPORT.md` (Municipality, Parcels analysed,
Numeric envelopes %, Legal refusals %, Unknown %, Coverage CERTIFIED).

**Strategic purpose (founder framing):** Mogán is the Canary tourism-envelope benchmark. Success
proves PRYZM can handle Telde (SIPU scaling) + Adeje (Tenerife tourism) + Arona (tourism
replication) + Mogán (Gran Canaria tourism) — becomes the template for San Bartolomé de Tirajana,
other Canary tourism municipalities, nationwide coastal development zones.

---

## 3. Founder's forensic assessment — two passes

### Pass 1

> "Mogán is a STRONG candidate for 100% envelope classification."

**Conclusions:** 100% parcel classification (envelope OR legal refusal) — YES, realistic; 100%
numeric envelopes — NOT proven yet; better candidate than Arona for PRYZM replication — YES.

**Proof 1 — Planning data exists:** Mogán is NOT blocked like Málaga, Granada, or some Galicia
cases. The municipality publishes Normas Subsidiarias, PGOU/Plan General documentation, urban
planning maps, urban development instruments, partial plans, special plans, detailed studies
(source: `transparencia.mogan.es` — official municipal planning portal contains extensive
documentation including urban/rural classification plans and multiple sector plans). Means "we need
to parse and resolve the hierarchy", not "we cannot find the law" — a PRYZM problem, not an
external blocker.

**Proof 2 — SITCAN/GRAFCAN planning dataset exists:** Mogán has a normalized planning dataset
published through Canarias spatial-data infrastructure containing planning documents, instruments,
distributions, downloadable packages (source: `datos.gob.es`). Architecture: parcel → SITCAN
planning geometry → instrument ID → rule document → envelope — exactly the Canarias SIPU pattern
already proven with Telde/El Sauzal.

**Proof 3 — The complexity is structured, not chaotic:** Mogán contains Puerto Rico, Amadores,
Taurito, Puerto de Mogán, Arguineguín — governed by NAMED instruments, not "unknown urban fabric".
Example: PGOU material explicitly references Playa de Amadores urban development conditions and
planning status (source: `gobiernodecanarias.org` PGOU Supletorio de Mogán PDF). A bad municipality
looks like parcel→?→unknown; Mogán looks like parcel→Amadores Plan Parcial→article 43→height=X→
envelope.

**Proof 4 — Already a PRYZM-compatible pattern:** compare Telde (problem: live WFS unavailable;
solution: offline SIPU shapefile) vs Mogán (problem: many instruments; solution: instrument
resolver) — no new architecture required.

**Expected coverage model:** Urban consolidated areas (Puerto Rico, Arguineguín, Puerto de Mogán) —
HIGH envelope coverage expected. Planned developments (Amadores, Tauro, Cornisa areas) — need
plan-specific rule packs. Protected/non-buildable land — legal refusal (counts toward 100%
classification).

**Real risk** — plan hierarchy conflict (example: old NNSS ✗ Plan Parcial ✗ Modification ✗ Modern
tourism plan) — need `resolveMoganInstrumentPriority()` with explicit precedence.

**Updated probability table (pass 1):** Planning geometry available 95% · Instrument resolver
possible 90% · Numeric envelope rules possible 75-85% · `Unknown=0%` 90% · 100% numeric envelope
65-75%.

**Decision (pass 1):** Mogán should move forward — probably a better next implementation target
than Arona because Canary data infrastructure already covers it, planning instruments are
discoverable, tourism value is extremely high, and it tests the hardest PRYZM capability (multiple
approved planning instruments + tourism urbanism + coastal constraints). Next engineering task:
`MOGAN_INSTRUMENT_COVERAGE_AUDIT` with success condition `{municipality:"35012-Mogan",
parcels_total, controlling_instrument_found, unknown:0}`.

### Pass 2 (deeper forensic)

Real test: "Can PRYZM realistically achieve 100% envelope classification for Mogán?" — not "can we
make a rule pack".

**Finding 1** — Mogán is one of the strongest Canary candidates: already represented in the Canary
planning system as systematised urban planning data — a structured dataset produced by the
Government of Canarias and normalised by GRAFCAN (source: `datos.gob.es`), not just PDFs.
Architecture: parcel → SIPU/GRAFCAN geometry → planning instrument → rule document → envelope —
exactly the pattern PRYZM already proved with Canarias.

**Finding 2** — Mogán is not one plan, it is many plans (actually good): the dataset contains
hundreds of planning resources — catalogue shows **342 distributions** for Mogán, including
approved modifications and sector plans (source: `datos.gob.es`). Example — Puerto Rico has
explicit SIPU resources for phases, modifications, urbanisation projects (source:
`datos.canarias.es`). Bad approach: "use PGOU for everything". Correct approach: parcel → Puerto
Rico Plan Parcial → modification → urbanisation conditions → envelope.

**Finding 3** — Tourism areas are actually the easiest commercial target: Puerto Rico has specific
approved Plan Parcial documentation (`datos.canarias.es`) — expected flow parcel → Puerto Rico
sector polygon → Plan Parcial → zone → height/FAR/occupancy → envelope. Taurito has a dedicated
planning instrument "Centro de Interés Turístico Nacional Costa Tauritos" with structured planning
data (`datos.gob.es`) — a normal parser fails here (Taurito ≠ generic residential) but PRYZM can
handle `instrumentType: "CITN"`. Loma de Pino Seco has a specific approved Plan Parcial in the
dataset (`datos.gob.es`) — not unknown, just needs extraction.

**Finding 4** — Main technical challenge is instrument resolution, not calculation: the resolver
must become `resolveMoganPlanningInstrument(parcel)` with priority 1. Special Plan, 2. Plan
Parcial, 3. Approved modification, 4. Detailed study, 5. General plan, 6. Refusal.

**Finding 5** — Where could Mogán fail:
- Risk A — raster-only rules (some Canary plans may be scanned/tables-in-PDFs/drawings without
  vectors — impact is NOT unknown, instead `LEGAL_REFUSAL: "authoritative parameter unavailable
  digitally"` — still counts as 100% classification).
- Risk B — tourism/legal hierarchy conflicts (example PGOU says 6 floors, Plan Parcial says 4
  floors, Modification says 5 floors — need `precedenceResolver()`).
- Risk C — terrain (Mogán is mountainous — need base envelope + terrain restriction + coastal
  restriction, not a blocker, becomes another provider `MoganTerrainConstraintProvider`).

**Expected final capability table (pass 2):** Planning data obtainable 95-100% · Parcel→instrument
mapping 90% · Numeric envelopes in main tourism zones 80% · Whole municipality resolved 90-95% ·
`Unknown=0` 95% · 100% numeric envelope 65-75%.

**Why Mogán may actually beat Arona:** Arona = complex tourism + many modifications; Mogán =
complex tourism + strong SIPU normalisation + many explicit sector instruments — the evidence is
better.

**Recommended implementation order (pass 2):** Stage 1 — Puerto Rico (proof: Plan Parcial resolver,
tourism envelope). Stage 2 — Taurito (proof: special tourism instrument). Stage 3 — Puerto de
Mogán (proof: coastal/tourism constraints). Stage 4 — everything else.

**Final verdict (founder's words):** "Mogán is proven as a valid PRYZM target. Strongest statement:
'Mogán has the data structure, legal instruments, and GIS foundation required for a 100%
parcel-resolution envelope system. The remaining work is transcription + precedence logic, not
discovery.' Next action: BUILD `esMoganInstrumentResolver.ts`, FIRST TARGET Puerto Rico + Taurito —
if those two pass, Mogán becomes the Canary tourism-envelope template."

---

## 4. Honest framing — proven vs. hypothesis

| Claim | Status |
|---|---|
| Mogán planning corpus published via `transparencia.mogan.es` and `datos.gob.es` (342 distributions) | Founder-asserted, single-source cited — **not independently re-verified by PRYZM** |
| Named sector instruments (Puerto Rico Plan Parcial, Taurito "CITN", Loma de Pino Seco Plan Parcial) | Founder-asserted from catalogue listings — instrument existence cited, not the actual numeric content |
| Tourism zones are "the easiest commercial target" | Founder's comparative judgment, not a measured result |
| Coverage probability tables (65-95% across sub-metrics) | Founder's own evolving estimate, explicitly not a measured result |
| `UNKNOWN = 0%` coverage | **Not proven** — no code or audit exists yet for Mogán |
| Code state | No `esMogan.ts` rule pack, no dispatch entry, no verified flag exist in the repo today |

---

## 5. Next action

Per the founder: build `esMoganInstrumentResolver.ts` first, piloted on Puerto Rico and Taurito
before wider rollout, then `MOGAN_INSTRUMENT_COVERAGE_AUDIT`, then the numeric rule pack, then
`scripts/auditMoganCoverage.ts`, then certification (`MOGAN_ENVELOPE_VERIFIED=true`,
`SIG-MOGAN-001`) — per Sprint 1 scope.

**Status: NOT IMPLEMENTED — queued for Canarias Sprint 1 (after the Fly.io production deploy)**
