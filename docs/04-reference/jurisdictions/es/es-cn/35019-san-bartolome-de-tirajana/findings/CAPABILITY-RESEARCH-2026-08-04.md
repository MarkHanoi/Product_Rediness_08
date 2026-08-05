# San Bartolomé de Tirajana (INE 35019, Gran Canaria, Canarias) — Founder Envelope-Capability Research

**Status: NOT IMPLEMENTED — queued for Canarias Sprint 1 (after the Fly.io production deploy)**

Source: founder-supplied research (ChatGPT-assisted deep research), captured and organized into
house documentation format on 2026-08-04. This document reproduces and structures the founder's
pasted research verbatim; it is **not** an independently re-verified PRYZM research pass (compare
the Cartagena/Lorca docs in `es-mc`, which are live-verified). No new fact-finding, citation
verification, or code was performed to produce this document. San Bartolomé de Tirajana has **no
code presence** in the repo yet — no rule pack, no dispatch entry, no verified flag.

---

## 1. Mission statement (as given)

Implement PRYZM legally grounded buildable-envelope generation for San Bartolomé de Tirajana
(Spain, Canarias, Gran Canaria, INE 35019). Goal: enable
`SAN_BARTOLOME_TIRAJANA_ENVELOPE_VERIFIED=true` only when `UNKNOWN=0%`. Every parcel must produce
a computed buildable envelope OR a legally grounded refusal with source citation. Never: estimated
values, inherited neighbour rules, guessed heights, generic tourism assumptions.

**Architecture constraints (explicit, as given):** DO NOT create `CanariasEngine`,
`GranCanariaEngine`, `TourismEngine`, or `SanBartolomeSpecialEngine`. Use existing PRYZM
architecture: `registry.ts` → `siteDispatch.ts` → municipality resolver → planning instrument
resolver → rule pack → constraint providers → geometry generator → L-449 certification. Reuse
existing Canary infrastructure (`sipuShapefile.ts`, `arcgisRest.ts`, overlay providers,
`l449CertificationGates.ts`).

---

## 2. Phase-by-phase implementation prompt (as given, for Sprint 1)

**Phase 1 — Jurisdiction package.** `jurisdictions/es-cn/35019-san-bartolome-de-tirajana/` with
`sources/` (`SIPU/`, `GRAFCAN/`, `PGOU/`, `NORMAS_URBANISTICAS/`, `PLANES_PARCIALES/`,
`PLANES_ESPECIALES/`, `ESTUDIOS_DETALLE/`, `MODIFICACIONES/`, `ALINEACIONES/`, `COSTA/`,
`VERIFICATION.md`) and `findings/` (`SOURCE-AUDIT.md`, `INSTRUMENT-COVERAGE.md`,
`RULE-EXTRACTION.md`, `BLOCKER-AUDIT.md`, `FINAL-COVERAGE.md`).

**Phase 2 — Acquire official planning corpus.** General Plan (PGOU, Normas Urbanísticas, zoning
plans, ordinance tables). Tourism priority instruments mandatory first: Meloneras, Maspalomas,
Playa del Inglés, San Agustín, Sonnenland. Collect Plan Parcial, Plan Especial, Modificaciones,
Ordenanzas particulares.

**Phase 3 — Planning instrument registry.**
`rulepacks/esSanBartolomeInstrumentRegistry.ts`. `SanBartolomePlanningInstrument` schema:
`{id, municipality:"35019", name, type: PGOU|PLAN_PARCIAL|PLAN_ESPECIAL|ESTUDIO_DETALLE|
MODIFICACION, approvalDate, geometrySource, documentSource, priority}`.

**Phase 4 — Instrument resolver.** `rulepacks/esSanBartolomeInstrumentResolver.ts`,
`resolveSanBartolomeInstrument(parcel)` → `{instrumentId, instrumentType, zoneCode,
sourceDocument, confidence: verified|partial}`. Legal precedence: 1. Plan Especial, 2. Plan
Parcial, 3. Estudio de Detalle, 4. Approved Modification, 5. PGOU, 6. Legal refusal. Every
resolution includes `{instrument, article, document, reason}`.

**Phase 5 — SIPU/GRAFCAN integration.** `providers/esSanBartolomeSipu.ts`. Support offline SIPU
package + cached geometry, not only live government endpoints. Output `{zoneCode,
planningInstrument, geometryConfidence}`.

**Phase 6 — Rule pack.** `rulepacks/esSanBartolome.ts`. `SanBartolomeEnvelopeRule` schema:
`{instrument, zoneCode, landUse: residential|tourist|hotel|commercial|mixed, maxHeight?,
maxFloors?, occupancy?, buildability?, setbacks?:{front?,rear?,side?}, alignment?, source,
article}`.

**Phase 7 — Tourism zoning model.** Do not collapse tourism categories. Support `HOTEL`,
`TOURIST_APARTMENT`, `RESIDENTIAL`, `MIXED_TOURISM`, `COMMERCIAL`, `PUBLIC_USE`. Rules must come
from Ordenanza + Article reference.

**Phase 8 — Priority implementation sequence.**
- STEP 1 — Meloneras (build first: parcel → Meloneras instrument → zone → rule → envelope;
  acceptance `unknown=0`).
- STEP 2 — Maspalomas (add tourism constraints, special plans, coastal restrictions).
- STEP 3 — Playa del Inglés (add older urban fabric, modifications, mixed-use rules).

**Phase 9 — Constraint providers.** `constraints/esSanBartolome/` with `sanBartolomeCoastal.ts`,
`sanBartolomeProtected.ts`, `sanBartolomeTerrain.ts`. Output `{constraintType, geometry,
legalReference}`.

**Phase 10 — Envelope resolver.** `rulepacks/resolveSanBartolomeEnvelope.ts`. Pipeline: parcel →
SIPU resolver → instrument resolver → zone resolver → rule pack → constraint providers → envelope
geometry → certification. Output `{status: ENVELOPE|LEGAL_REFUSAL, geometry?, height?, volume?,
sources[], trace[], refusalReason?}`.

**Phase 11 — Coverage audit.** `scripts/auditSanBartolomeCoverage.ts`. Output
`{municipality:"35019", totalParcels, buildableParcels, numericEnvelopes, legalRefusals,
unknown}`. Required: `unknown=0`.

**Phase 12 — Certification gate.** Only after audit passes, enable
`SAN_BARTOLOME_TIRAJANA_ENVELOPE_VERIFIED=true`, create `SIG-SBT-001`. Evidence bundle: parcel +
instrument + zone + article + calculation + geometry.

**Final deliverable:** `SAN-BARTOLOME-100-PERCENT-ENVELOPE-REPORT.md` (Municipality, Parcels
analysed, Computed envelopes %, Legal refusals %, Unknown %, Certification READY FOR L-449).

**Strategic objective (founder framing):** San Bartolomé de Tirajana is the Canary stress test. If
successful, Telde + El Sauzal + Adeje + Arona + Mogán + San Bartolomé de Tirajana creates a
reusable Canary tourism-envelope capability covering the highest-value development markets.

---

## 3. Founder's data-proof assessment

> "I checked whether we have the ingredients required to create legally grounded envelopes. The
> answer: YES — San Bartolomé de Tirajana has the required data foundation. It is actually one of
> the strongest Canary candidates."

The real engineering question is not "do we have planning data" (we do) but "can we connect parcel
→ planning instrument → zone → numeric rule → envelope?" Evidence says yes, with expected
transcription work.

1. **Official SIPU planning dataset exists:** the Government of Canarias publishes a systematised
   urban planning dataset for San Bartolomé de Tirajana containing Plan General de Ordenación,
   SIPU structured files, GIS resources, planning documentation. The official resource provides
   the SIPU ZIP package for the approved consolidated PGOU (source: `datos.canarias.es`). Same
   class of source as the Canarias strategy: SIPU ZIP → GIS layers → zone identification.

2. **The data is not only PDFs — it is GIS-normalised:** dataset described as "Planeamiento
   urbanístico sistematizado", normalisation performed by GRAFCAN (Cartográfica de Canarias)
   (source: `datos.gob.es`). Expect polygon layers + attributes + planning documents, not only
   scanned plans — removes the biggest Canary blocker.

3. **Multiple legal instruments available:** dataset contains many planning resources including
   approved PGOU, modifications, detailed studies, sector planning material (source: `datos.gob.es`
   open-data catalogue). Resolver must be parcel → Meloneras Plan Parcial / Maspalomas sector /
   Playa del Inglés instrument / PGOU fallback → envelope, not a single PGOU parser.

4. **Direct evidence of numeric rule sources:** municipal planning documentation contains normative
   documents — PGOU archive includes Normas Urbanísticas, Memoria, associated planning documents
   (source: `sede.maspalomas.com` PGOU SBT 03.1 documentos asociados). Example extraction targets:
   Artículo X — Altura máxima (N plantas), Ocupación (%), Edificabilidad (m²/m²), Retranqueos
   (metros).

5. **Tourism areas especially promising:** Meloneras has specific planning documents for
   developments with parcel-specific urban rules (source: `idegrancanaria.es` BOP publication on a
   2025 minor modification to Plan Parcial Meloneras). Expected flow: parcel → Meloneras sector
   polygon → Ordenanza particular → Height → Occupancy → Envelope. Maspalomas expected: special
   planning + tourism regulations + coastal constraints. Playa del Inglés expected: older urban
   fabric + multiple modifications + PGOU rules — harder but still feasible.

6. **Blocker analysis table (as given):** Parcel geometry Available · Planning GIS Available ·
   Legal planning documents Available · Zone classification Likely achievable · Height rules Likely
   extractable · FAR/buildability Likely extractable · Tourism instruments Available · Coastal
   constraints Available separately · 100% coverage — possible.

**Expected PRYZM status:** before implementation `SAN_BARTOLOME_TIRAJANA_ENVELOPE_VERIFIED=false`.
After resolver build, expected NUMERIC ENVELOPE + LEGAL REFUSAL = 100% PARCEL RESPONSE.

**Difficulty estimate vs other Canary municipalities (as given):** Telde Low · El Sauzal Low ·
Adeje Medium · Arona Medium-High · Mogán High · San Bartolomé de Tirajana Very High. But value
scores: Market value 5/5, Data availability 5/5, Reuse value 5/5.

**Verdict — Proven:** official SIPU exists; GIS-normalised planning data exists; legal documents
exist; sector-level instruments exist; numeric envelope extraction is realistic. **Not yet
proven:** complete zone-to-rule transcription; modification precedence; every tourism sector
parameter. Correct next step: build the San Bartolomé de Tirajana resolver, starting with Meloneras
→ Maspalomas → Playa del Inglés. This is likely the Canary municipality that proves PRYZM can move
from isolated envelope pilots into a scalable tourism-region engine.

---

## 4. Honest framing — proven vs. hypothesis

| Claim | Status |
|---|---|
| SIPU ZIP package published for San Bartolomé de Tirajana PGOU (datos.canarias.es / datos.gob.es) | Founder-asserted, single-source cited — **not independently re-verified by PRYZM** |
| Meloneras 2025 minor Plan Parcial modification (idegrancanaria.es BOP) | Founder-asserted citation — not independently opened/confirmed in this pass |
| Numeric rule sources exist in PGOU Normas Urbanísticas (sede.maspalomas.com) | Founder-asserted from a documented-associated-files listing, not from opened article text |
| "Very High" implementation difficulty relative to other Canary municipalities | Founder's own comparative estimate, explicitly qualified against high market/data/reuse value |
| `UNKNOWN = 0%` coverage | **Not proven** — no code or audit exists yet for San Bartolomé de Tirajana |
| Code state | No `esSanBartolome.ts` rule pack, no dispatch entry, no verified flag exist in the repo today |

---

## 5. Next action

Per the founder: build the resolver starting with Meloneras (Step 1), then Maspalomas (Step 2, add
tourism/coastal constraints), then Playa del Inglés (Step 3, add older fabric and modifications),
before wider municipality rollout — per Sprint 1 scope.

**Status: NOT IMPLEMENTED — queued for Canarias Sprint 1 (after the Fly.io production deploy)**
