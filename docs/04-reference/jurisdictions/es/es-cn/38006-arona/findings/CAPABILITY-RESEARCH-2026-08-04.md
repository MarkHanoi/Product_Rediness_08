# Arona (INE 38006, Tenerife, Canarias) — Founder Envelope-Capability Research

**Status: NOT IMPLEMENTED — queued for Canarias Sprint 1 (after the Fly.io production deploy)**

Source: founder-supplied research (ChatGPT-assisted deep research), captured and organized into
house documentation format on 2026-08-04. This document reproduces and structures the founder's
pasted research verbatim; it is **not** an independently re-verified PRYZM research pass (compare
the Cartagena/Lorca docs in `es-mc`, which are live-verified). No new fact-finding, citation
verification, or code was performed to produce this document. Arona has **no code presence** in the
repo yet — no rule pack, no dispatch entry, no verified flag.

---

## 1. Mission statement (as given)

Implement PRYZM's legally grounded buildable-envelope resolver for Arona (Spain, Canarias,
Tenerife, INE 38006). Objective: convert Arona into a production-capable municipality —
`ARONA_ENVELOPE_VERIFIED=true`. Acceptance: `UNKNOWN=0%`, every buildable parcel results in a
computed envelope OR a legally justified refusal, never a generic estimate/inherited neighbour
rules/unsupported height assumptions/silent fallback.

**Architecture constraints (explicit, as given):** DO NOT create `CanariasEngine.ts`,
`TenerifeEngine.ts`, or `AronaSpecialEngine.ts`. Use existing PRYZM architecture: `registry.ts` →
site dispatch → jurisdiction resolver → rule pack → envelope generator → L-449 certification.
Reuse `sipuShapefile.ts`, `arcgisRest.ts`, overlay providers, L-449 gates.

---

## 2. Phase-by-phase implementation prompt (as given, for Sprint 1)

**Phase 1 — Jurisdiction package.** `jurisdictions/es-cn/38006-arona/` with `sources/` (`SIPU/`,
`PGOU/`, `NORMAS/`, `FICHAS/`, `PLANES_PARCIALES/`, `ESTUDIOS_DETALLE/`, `MODIFICACIONES/`,
`ALINEACIONES/`, `COSTA/`, `VERIFICATION.md`) and `findings/` (`SOURCE-AUDIT.md`,
`INSTRUMENT-AUDIT.md`, `BLOCKER-AUDIT.md`, `COVERAGE-AUDIT.md`).

**Phase 2 — Source acquisition.** Base planning (PGOU Arona, urban regulations, detailed zoning,
general rules). Development instruments: Plan Parcial, Estudios de Detalle, Unidades de Actuación,
Modificaciones. Critical areas: Los Cristianos, Playa de las Américas, Costa del Silencio,
Palm-Mar, Las Galletas, Cabo Blanco, Valle San Lorenzo.

**Phase 3 — Planning instrument graph.**
`packages/site-parcel-data/src/rulepacks/esAronaInstrumentResolver.ts`. Determine the legally
controlling planning instrument for every parcel from parcel geometry + SIPU planning geometry.
Output: `{parcelId, controllingInstrument: PGOU|PLAN_PARCIAL|ESTUDIO_DETALLE|MODIFICACION,
documentId, approvalDate, zoneCode, sourceReference}`. Instrument priority: most specific approved
instrument → sector/Plan Parcial → Estudio de Detalle → approved modification → PGOU. Do not
assume; document every precedence decision.

**Phase 4 — SIPU resolver.** Reuse `providers/sipuShapefile.ts`; create `resolveAronaZone.ts`.
Flow: parcel → SIPU polygon intersection → planning instrument → zone code → rule lookup. Output
`{zoneCode, instrument, legalSource, confidence: verified|partial}`.

**Phase 5 — Arona rule pack.** `packages/site-parcel-data/src/rulepacks/esArona.ts` with an
`AronaEnvelopeRule` interface: `zoneCode, instrument, maxHeight, maxFloors, maxOccupancy,
buildability, frontSetback, sideSetback, rearSetback, alignmentRule, tourismCategory:
hotel|tourist-apartment|residential|mixed, sourceArticle, sourceDocument`.

**Phase 6 — Tourism urbanism handling.** Explicit classes `HOTEL`, `TOURIST_APARTMENT`,
`RESIDENTIAL`, `MIXED_USE`, `COMMERCIAL`. Never merge tourist apartment = residential unless the
legal document states it.

**Phase 7 — Coastal constraint provider.** `constraints/aronaCoastal.ts`. Inputs: DPMT, coastal
servitude, protected areas. Output `{constraintType, geometry, legalReference}`. Architecture:
envelope calculation + constraint overlay = final legal envelope.

**Phase 8 — Envelope resolver.** `resolveAronaEnvelope.ts`. Flow: parcel → instrument resolver →
zone resolver → rule pack → geometry calculation → constraint application → envelope/refusal.
Output `{status: ENVELOPE|REFUSAL, geometry?, height?, volume?, sourceReferences[],
calculationTrace[], refusalReason?}`.

**Phase 9 — Coverage proof.** `scripts/auditAronaCoverage.ts`. Output `{municipality:"Arona",
totalParcels, buildableParcels, envelopesGenerated, legalRefusals, unknown, coveragePercentage}`.
Hard requirement: `unknown=0`.

**Phase 10 — Certification.** Only after audit, enable `ARONA_ENVELOPE_VERIFIED=true`, add
`SIG-ARONA-001`. Required evidence: source document, article reference, zone code, instrument,
calculation trace.

**Final deliverable:** `ARONA-100-PERCENT-ENVELOPE-REPORT.md` (Municipality, Buildable parcels
analysed, Computed envelopes %, Legal refusals %, Unknown %, Certification READY/NOT READY).

**Strategic objective (founder framing):** Arona proves that El Sauzal (clean PGOU) + Telde (SIPU
scaling) + Adeje (multi-instrument tourism) + Arona (tourism replication) can become a reusable
Canarias deployment model.

---

## 3. Founder's forensic verification pass

> "I did a deeper verification pass on Arona (38006). The previous prompt assumed a favourable
> path; now we test whether that assumption is actually justified."

**Verdict:** Yes, technically plausible, but **100% computed envelopes = NOT proven yet**; **100%
parcel classification (envelope OR legal refusal) = highly achievable**. Arona is a
multi-instrument urbanism municipality, exactly the type PRYZM is designed to handle.

**Evidence found:**
1. Arona has accessible planning source material — official urbanism portal (`arona.org`) lists
   the PGOU and multiple plan documents including detailed urban ordering sheets — already better
   than blocked cases like Málaga/Granada.
2. Arona has **multiple planning instruments** (critical discovery) — the municipality explicitly
   publishes separate instruments including Plan Especial de Ordenación del Puerto de Las Galletas,
   Estudios de Detalle in Palm-Mar, revision/modification documentation (source: `arona.org`).
   Therefore a single PGOU parser is impossible; correct architecture is parcel → PGOU / Plan
   Parcial / Estudio de Detalle / Modification / Special Plan → final envelope.
3. High-value development zones are document-rich — Playa de Las Américas has historical
   modifications (Canary government records approved modifications, source:
   `gobiernodecanarias.org` BOC 1991/098); Palm-Mar has dedicated urban documentation and detailed
   studies (`arona.org`) — "specific polygon + specific instrument + specific rule table = high
   confidence envelope"; El Mojón — one of the largest undeveloped urban development areas in
   Canarias, with specific plan history and development complexity (source: Cadena SER article on
   the mayor of Arona) — not a blocker, means "Plan Parcial resolver required".

**Breakdown by category:**
- **Category A** — Existing urban fabric (Los Cristianos, Playa de las Américas, Las Galletas):
  HIGH probability, expected parcel → zone → ordinance → envelope.
- **Category B** — Detailed plan areas (Palm-Mar, El Mojón): MEDIUM-HIGH, need Plan Parcial
  geometry + approval document + parameter extraction.
- **Category C** — Special protection/coastal: need envelope + restriction overlay, not a failure
  (example: buildable YES, height 12m, coastal restriction YES, final = restricted envelope).

**Only things that could prevent 100% (as given):**
- Risk 1 — missing machine-readable geometry (if some plan exists only as scanned PDFs, result =
  legal refusal, not unknown).
- Risk 2 — unresolved modifications (if PGOU says A, modification says B, need precedence engine).
- Risk 3 — tourism regulation (hotels/tourist apartments may require special interpretation; need
  tourism use ≠ residential use).

**Confidence score table:** Obtain planning documents 95% · Build zoning resolver 85% · Build rule
pack 75% · Compute meaningful envelopes 75-85% · Achieve 100% classification 90% · Achieve 100%
numeric envelopes 60-70%.

**Implementation strategy revision:** do NOT start with all Arona. Phase 1 — prove commercial
zones: 1. Los Cristianos, 2. Playa de las Américas, 3. Palm-Mar (target 30-40% of economic value).
Then: 4. El Mojón, 5. Las Galletas, 6. Rural nuclei.

**Final proof statement (founder's words):** "Arona is not another Telde. Telde proved Canarias GIS
extraction; Arona proves Canarias complex tourism urbanism. Next implementation task is not the
full envelope engine — it is `ARONA_INSTRUMENT_COVERAGE_AUDIT`, goal: produce `{"parcel_count":
XXXX, "instrument_assigned": XXXX, "unknown": 0}`. Only after this passes do we write the numeric
envelope rules."

---

## 4. Honest framing — proven vs. hypothesis

| Claim | Status |
|---|---|
| PGOU + multiple instruments (Plan Especial Puerto de Las Galletas, Palm-Mar Estudios de Detalle) publicly listed on arona.org | Founder-asserted, single-portal source — **not independently re-verified by PRYZM** |
| Playa de Las Américas modifications recorded in BOC 1991/098 | Founder-asserted citation — not independently opened/confirmed in this pass |
| El Mojón development-area characterization (Cadena SER press) | Founder-asserted secondary/press source, not a planning document |
| 100% parcel classification (envelope OR refusal) achievable | Founder's estimate (90%), explicitly distinguished from numeric envelope coverage (60-70%) |
| `UNKNOWN = 0%` coverage | **Not proven** — no code or audit exists yet for Arona |
| Code state | No `esArona.ts` rule pack, no dispatch entry, no verified flag exist in the repo today |

---

## 5. Next action

Per the founder: do not build the full envelope engine first. Build
`ARONA_INSTRUMENT_COVERAGE_AUDIT` first (parcel → controlling-instrument assignment, target
`unknown: 0` on instrument assignment alone), piloted on Los Cristianos → Playa de las Américas →
Palm-Mar before the numeric rule pack, per Sprint 1 scope.

**Status: NOT IMPLEMENTED — queued for Canarias Sprint 1 (after the Fly.io production deploy)**
