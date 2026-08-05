# Yaiza (INE 35034, Lanzarote, Canarias) — Founder Envelope-Capability Research

**Status: NOT IMPLEMENTED — queued for Canarias Sprint 1 (after the Fly.io production deploy)**

Source: founder-supplied research (ChatGPT-assisted deep research), captured and organized into
house documentation format on 2026-08-04. This document reproduces and structures the founder's
pasted research verbatim; it is **not** an independently re-verified PRYZM research pass (compare
the Cartagena/Lorca docs in `es-mc`, which are live-verified). No new fact-finding, citation
verification, or code was performed to produce this document. Yaiza has **no code presence** in the
repo yet — no rule pack, no dispatch entry, no verified flag. Yaiza is also the first Lanzarote
(rather than Tenerife/Gran Canaria) municipality in this research batch.

---

## 1. Mission statement (as given)

Implement PRYZM legally grounded buildable-envelope generation for Yaiza (Spain, Canarias,
Lanzarote, INE 35034). Primary goal: `YAIZA_ENVELOPE_VERIFIED=true` only when `UNKNOWN=0%`. Every
parcel returns a computed buildable envelope OR a legally grounded refusal. Never: estimated
envelopes, generic tourism assumptions, inherited neighbouring rules, undocumented parameters.

**Architecture constraints (explicit, as given):** DO NOT create `CanariasEngine`,
`LanzaroteEngine`, `TourismEngine`, or `YaizaSpecialEngine`. Use existing PRYZM architecture:
`registry.ts` → `siteDispatch.ts` → municipality resolver → planning instrument resolver → zone
resolver → rule pack → constraint providers → geometry generator → L-449 certification. Reuse
`sipuShapefile.ts`, `arcgisRest.ts`, overlay providers, `l449CertificationGates.ts`.

---

## 2. Phase-by-phase implementation prompt (as given, for Sprint 1)

**Phase 1 — Jurisdiction package.** `jurisdictions/es-cn/35034-yaiza/` with `sources/` (`SIPU/`,
`GRAFCAN/`, `PGOU/`, `NORMAS_URBANISTICAS/`, `PLANES_PARCIALES/`, `PLANES_ESPECIALES/`,
`ESTUDIOS_DETALLE/`, `MODIFICACIONES/`, `COSTA/`, `PROTECCION/`, `VERIFICATION.md`) and
`findings/` (`SOURCE-AUDIT.md`, `INSTRUMENT-COVERAGE.md`, `RULE-EXTRACTION.md`,
`BLOCKER-AUDIT.md`, `FINAL-COVERAGE.md`).

**Phase 2 — Acquire authoritative data.** SIPU/GRAFCAN (municipal planning package, zoning layers,
planning instrument polygons, attributes, document references). Priority areas: 1. Playa Blanca,
2. Montaña Roja, 3. Puerto Calero, 4. Las Coloradas.

**Phase 3 — Yaiza instrument registry.** `rulepacks/esYaizaInstrumentRegistry.ts`.
`YaizaPlanningInstrument` schema: `{id, municipality:"35034", name, type:
PGOU|PLAN_PARCIAL|PLAN_ESPECIAL|ESTUDIO_DETALLE|MODIFICACION, approvalDate, geometrySource,
documentSource, priority}`.

**Phase 4 — Instrument resolver.** `rulepacks/esYaizaInstrumentResolver.ts`,
`resolveYaizaInstrument(parcel)` → `{instrumentId, instrumentType, zoneCode, sourceDocument,
confidence: verified|partial}`. Legal precedence: 1. Plan Especial, 2. Plan Parcial, 3. Estudio de
Detalle, 4. Approved Modification, 5. PGOU, 6. Legal refusal. Every resolution includes `{source,
article, instrument, reason}`.

**Phase 5 — SIPU provider.** `providers/esYaizaSipu.ts`. Support offline SIPU package + cached
geometry. Output `{zoneCode, instrumentId, planningArea, geometryConfidence}`.

**Phase 6 — Rule extraction.** `rulepacks/esYaiza.ts`. `YaizaEnvelopeRule` schema: `{instrument,
zoneCode, landUse: residential|tourist|hotel|commercial|mixed, maxHeight?, maxFloors?, occupancy?,
buildability?, setbacks?:{front?,rear?,side?}, alignment?, sourceDocument, sourceArticle}`.

**Phase 7 — Tourism model.** Do not merge categories. Support `HOTEL`, `TOURIST_APARTMENT`,
`RESIDENTIAL`, `MIXED_TOURISM_RESIDENTIAL`, `COMMERCIAL`, `PUBLIC`. Every numeric value requires
document + article + zone.

**Phase 8 — Priority pilots.**
- Pilot 1 — Playa Blanca (parcel → Playa Blanca instrument → unit/zone → rule → envelope;
  acceptance `UNKNOWN=0`).
- Pilot 2 — Montaña Roja (Plan Parcial rules, parcel-specific parameters, tourism constraints).
- Pilot 3 — Puerto Calero (resort rules, special planning, coastal limitations).

**Phase 9 — Constraint providers.** `constraints/esYaiza/` with `yaizaCoastal.ts`,
`yaizaProtectedAreas.ts`, `yaizaTerrain.ts`. Output `{constraintType, geometry, legalReference}`.

**Phase 10 — Envelope resolver.** `rulepacks/resolveYaizaEnvelope.ts`. Pipeline: parcel → SIPU
resolver → instrument resolver → zone resolver → rule pack → constraint providers → envelope
generator → certification. Output `{status: ENVELOPE|LEGAL_REFUSAL, geometry?, height?, volume?,
sources[], trace[], refusalReason?}`.

**Phase 11 — Coverage audit.** `scripts/auditYaizaCoverage.ts`. Output `{municipality:"35034",
totalParcels, buildableParcels, numericEnvelopes, legalRefusals, unknown}`. Required:
`unknown=0`.

**Phase 12 — Certification gate.** After audit, enable `YAIZA_ENVELOPE_VERIFIED=true`, create
`SIG-YAIZA-001`. Evidence package: parcel + instrument + zone + article + calculation trace +
final geometry.

**Final report:** `YAIZA-100-PERCENT-ENVELOPE-REPORT.md` (Municipality, Parcels analysed, Computed
envelopes %, Legal refusals %, Unknown %, Certification READY FOR L-449).

**Strategic objective (founder framing):** Yaiza becomes the Lanzarote template. After completion,
Telde + El Sauzal + Adeje + Arona + Mogán + San Bartolomé de Tirajana + Yaiza creates a repeatable
Canary coastal/tourism envelope capability.

---

## 3. Founder's assessment — two passes

### Pass 1

> "YES — Yaiza has machine-readable planning data. This is a strong candidate. The data quality is
> actually better than many mainland municipalities because Canarias has a structured SIPU
> system."

1. **Official SIPU package exists (machine-readable):** the Government of Canarias publishes
   "Planeamiento urbanístico sistematizado del municipio de Yaiza", produced and maintained by the
   Canary Government with normalisation by GRAFCAN — explicitly described as "sistematized urban
   planning", not just document storage (source: `datos.canarias.es`). Main PGOU resource
   available as "Aprobación Definitiva de Plan General de Ordenación de Yaiza", format ZIP, type
   SIPU (source: `datos.canarias.es`). Same class of input PRYZM wants: SIPU ZIP → GIS layers →
   zone polygons → legal documents → rules.

2. **Dataset contains multiple planning instruments:** Yaiza is not only PGOU→everything — the
   dataset contains multiple distributions including PGOU, Plan Parcial related material, Estudios
   de Detalle, modifications. The open dataset lists **19 distributions/resources** (source:
   `datos.gob.es`). Examples — Playa Blanca has machine-readable SIPU resources for CJ3G parcel,
   CJ3P/CJ3S parcels, Las Coloradas studies (source: `datos.gob.es`).

3. **Exactly the PRYZM architecture pattern:** expected flow parcel → SIPU geometry → planning
   instrument resolver → zone code → normativa → envelope, not PDF-reading only.

4. **Evidence for high-value target areas:** Playa Blanca confirmed — Plan General, Plan Parcial
   context, Estudios de Detalle; example "Estudio de Detalle de parcela CJ3G de Plan Parcial de
   Playa Blanca, Unidad de Actuación-2 de Yaiza" published as SIPU ZIP (source:
   `datos.canarias.es`) — ideal because PRYZM can resolve parcel → specific unit → specific rule →
   envelope. Montaña Roja confirmed — dedicated SIPU package for "Estudio de Detalle de las
   parcelas ID4, ID5 e ID6 de Plan Parcial Montaña Roja de Yaiza" (source: `datos.canarias.es`) —
   means Montaña Roja is not unknown, a specific planning instrument exists.

5. **What is still unknown — table (as given):** Does GIS exist? Yes. Can we download it? Yes. Is
   it structured? Yes. Are planning instruments separated? Yes. Can parcel→zone be resolved? Likely
   yes. Are all numeric rules extracted? Needs implementation. Are all modifications reconciled?
   Needs resolver.

6. **Expected PRYZM capability table (as given):** Parcel identification 95%+ · Instrument
   resolution 85-95% · Numeric envelope extraction 70-85% · Legal refusal fallback 100% ·
   `Unknown=0%` Achievable.

**Verdict (pass 1):** Yaiza passes the first gate — machine-readable GIS, SIPU ZIP, official
planning corpus, sector-level instruments, Playa Blanca/Montaña Roja data, GRAFCAN-normalised
structure all present. Correct next step is not more research, it is implementation: create
`esYaizaSipuProvider.ts`, `esYaizaInstrumentResolver.ts`, `esYaizaRulepack.ts`,
`resolveYaizaEnvelope.ts`. Founder's words: "Yaiza is a better candidate than many mainland cities
because the Canary SIPU ecosystem already gives PRYZM the hardest missing piece: structured
planning geometry."

### Pass 2

> "YES — Yaiza is a viable envelope-generation target. But the correct classification today is
> `YAIZA_ENVELOPE_VERIFIED=false`, Reason: rule extraction + instrument precedence not yet
> implemented. Not because data is missing."

**Capability proof chain:** Parcel → Authoritative planning geometry → Applicable planning
instrument → Zone/ordinance → Numeric parameters → Envelope geometry.

**Layer status table (as given):** Parcel geometry Available · SIPU planning geometry Available ·
Planning instruments Available · Normative documents Available · Numeric rules Expected in
ordinances · Envelope generation Technically possible.

**Where envelopes can be created first:**
1. Playa Blanca — HIGH CONFIDENCE, expected parcel → Plan Parcial Playa Blanca → unit/zone →
   height → occupancy → buildability → envelope, strongest starting point.
2. Puerto Calero/resort areas — expected parcel → specific tourism planning → ordenanza →
   envelope.
3. Montaña Roja — dedicated planning instruments exist, flow parcel → Montaña Roja Plan Parcial →
   parcel-specific rules → envelope.

**What could prevent 100% numeric envelopes — three cases (as given):**
- Case 1 — a parcel belongs to a plan but parameters are only graphical (e.g. height shown only on
  drawing, no numeric table) — correct PRYZM output is `{status:"LEGAL_REFUSAL",
  reason:"Authoritative numeric parameter unavailable"}`, not a failure.
- Case 2 — multiple instruments overlap (PGOU + Plan Parcial + Modification) — need
  `resolveYaizaInstrumentPrecedence()`.
- Case 3 — protected/coastal land (Yaiza has coastline, volcanic landscape, protected areas) —
  should become constraints: base envelope minus coastal restriction minus protected area = final
  envelope.

**Realistic coverage estimate before implementation:** Numeric envelopes 70-85% · Legal refusals
15-30% · Unknown 0% achievable. Important distinction (founder's words): metric "100% parcel
resolution" is realistic; metric "100% numeric envelopes" is unlikely because some land will
legally not have deterministic parameters.

**Decision (pass 2):** Yaiza should move into implementation. Priority: 1. Playa Blanca, 2. Montaña
Roja, 3. Puerto Calero, 4. Remaining urban sectors, 5. Protected/rural refusal layer. Target
`YAIZA_ENVELOPE_VERIFIED=true` after parcel coverage audit shows
`ENVELOPE+LEGAL_REFUSAL=100%`, `UNKNOWN=0%`. Verdict: "Build it. Yaiza has the data foundation
required."

---

## 4. Honest framing — proven vs. hypothesis

| Claim | Status |
|---|---|
| Yaiza SIPU ZIP package + 19-distribution dataset (datos.canarias.es / datos.gob.es) | Founder-asserted, single-source cited — **not independently re-verified by PRYZM** |
| Named sub-parcel instruments (Playa Blanca CJ3G/CJ3P/CJ3S, Montaña Roja ID4/ID5/ID6) | Founder-asserted from catalogue listings — existence cited, numeric content not opened/verified |
| Numeric coverage estimates (70-85% envelopes, 15-30% refusals) | Founder's own estimate, explicitly distinguished from "100% parcel resolution" (which is claimed realistic) |
| `UNKNOWN = 0%` coverage | **Not proven** — no code or audit exists yet for Yaiza |
| Code state | No `esYaiza.ts` rule pack, no dispatch entry, no verified flag exist in the repo today; this is also the first Lanzarote municipality touched by this research batch (all others are Tenerife/Gran Canaria) |

---

## 5. Next action

Per the founder: implement in priority order — Playa Blanca (pilot 1) → Montaña Roja (pilot 2) →
Puerto Calero (pilot 3) → remaining urban sectors → protected/rural refusal layer — then run the
coverage audit before flipping `YAIZA_ENVELOPE_VERIFIED`, per Sprint 1 scope.

**Status: NOT IMPLEMENTED — queued for Canarias Sprint 1 (after the Fly.io production deploy)**
