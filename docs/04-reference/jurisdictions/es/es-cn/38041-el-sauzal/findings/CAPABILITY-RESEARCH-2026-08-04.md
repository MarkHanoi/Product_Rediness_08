# El Sauzal (INE 38041, Tenerife, Canarias) — Founder Envelope-Capability Research

**Status: NOT IMPLEMENTED — queued for Canarias Sprint 1 (after the Fly.io production deploy)**

Source: founder-supplied research (ChatGPT-assisted deep research), captured and organized into
house documentation format on 2026-08-04. This document reproduces and structures the founder's
pasted research verbatim; it is **not** an independently re-verified PRYZM research pass (compare
the Cartagena/Lorca docs in `es-mc`, which are live-verified). No new fact-finding, citation
verification, or code was performed to produce this document. El Sauzal is already **partially
wired in code** (`packages/site-parcel-data/src/rulepacks/esElSauzal.ts`,
`apps/editor/src/ui/site/siteDispatch.ts`'s `applyElSauzalZoningThenFallback`), with
`EL_SAUZAL_ENVELOPE_VERIFIED = false`. This document captures the founder's "push to 100%
coverage" research that should inform the Sprint 1 implementation of that existing scaffold — it
does not itself change the verified flag or any code.

---

## 1. Mission statement (as given by the founder)

Implement a legally grounded PRYZM envelope resolver for El Sauzal (Spain, Canarias, Tenerife, INE
38041). The objective is not a partial demo — **every applicable buildable parcel must produce
either a computed buildable envelope or a legally justified refusal**. Target: `UNKNOWN = 0%`. No
fabricated estimates, no generic defaults, no silent fallback.

**Architecture constraints (explicit, as given):**
- DO NOT create `CanariasEngine.ts` or `ElSauzalSpecialEngine.ts`.
- DO NOT bypass `registry.ts`, the site-parcel-data resolver framework, or the L-449 certification
  gates.
- Use the existing pipeline: parcel → jurisdiction dispatch → zone resolver → rule pack →
  constraint providers → envelope generator.

---

## 2. Phase-by-phase implementation prompt (as given, for Sprint 1)

**Phase 1 — Source ingestion.** Acquire the El Sauzal planning package (SIPU/GRAFCAN planning
dataset, PGOU documentation, Normas Urbanísticas, Ordenanzas particulares, Fichas urbanísticas,
Alineaciones y rasantes, Protection catalogue, Sector/UA documentation). Create
`jurisdictions/es-cn/38041-el-sauzal/sources/` with subfolders `SIPU/`, `PGOU/`, `NORMAS/`,
`FICHAS/`, `ALINEACIONES/`, `PROTECCION/`, `VERIFICATION.md`.

**Phase 2 — Source verification.** Create `findings/ELSAUZAL_SOURCE_AUDIT.md` documenting
municipality (name/ine), source availability flags (`sipu_available`, `pgou_available`,
`numeric_rules_available`, `alignment_available`), geometry (`crs`, `feature_count`), and legal
metadata (`planning_instrument`, `approval_date`).

**Phase 3 — Zone inventory extraction.** Create `esElSauzalZoneInventory.ts` generating
`ELSAUZAL_ZONE_INVENTORY.json` with schema `{zoneCode, zoneName, landClass:
urban|urbanizable|rural|protected, planningInstrument, sourceDocument, articleReferences[],
applicable}`. Acceptance: every SIPU polygon must resolve zone polygon → zoneCode → legal source,
otherwise `{"status":"REFUSAL","reason":"No legal classification found"}`.

**Phase 4 — Envelope rule pack.** `packages/site-parcel-data/src/rulepacks/esElSauzal.ts`
implementing an `ElSauzalEnvelopeRule` interface: `zoneCode, maxHeight, maxFloors, maxOccupancy,
maxBuildability, frontSetback, sideSetback, rearSetback, alignmentRule, sourceArticle, confidence:
verified|partial`. Mandatory rule extraction for every zone: Height (max floors, cornice height,
ridge height), Occupation (% occupied, max footprint), Buildability (m2t/m2s, volume, density),
Setbacks (front/rear/side), Alignment (connect to the Alineaciones y Rasantes resolver). Do not
approximate.

**Phase 5 — Parcel resolver.** Implement `resolveElSauzalParcel()`: parcel → SIPU intersection →
zone code → rule lookup → alignment lookup → envelope calculation. Output: `{status:
ENVELOPE|REFUSAL, geometry?, height?, volume?, sourceReferences[], refusalReason?}`.

**Phase 6 — Constraint overlays.** Integrate existing overlay architecture (heritage, flood,
environment, coastal, protection) as "envelope + constraints", never "constraint = no-envelope"
unless legally required. Do not modify envelope logic.

**Phase 7 — 100% coverage audit.** Create `scripts/auditElSauzalCoverage.ts`. Input: all buildable
parcels. Output: `ELSAUZAL_COVERAGE_REPORT.json {municipality, totalParcels, buildableParcels,
envelopesGenerated, legalRefusals, unknown, coveragePercentage}`. Acceptance criteria:
`unknown = 0`; every envelope carries `zoneCode`/`articleReference`/`sourceDocument`/
`calculationTrace`; every refusal carries `legalReason`/`sourceReference`.

**Phase 8 — Certification.** Create `findings/CAPABILITY-AUDIT.md`, `findings/BLOCKER-AUDIT.md`,
`verification/SIGNATURE.md`. Only then enable `EL_SAUZAL_ENVELOPE_VERIFIED=true` with
`SIG-ELSAUZAL-001`.

**Final deliverable:** `ELSAUZAL-100-PERCENT-ENVELOPE-REPORT.md` (Municipality, Parcels analysed,
Envelope generated %, Legally refused %, Unknown %, Production YES/NO).

**Strategic purpose (founder framing):** El Sauzal becomes the Canary reference implementation. If
successful: El Sauzal → Telde → Adeje → Arona → Canarias scale-out. Optimize for replication speed
after first success.

---

## 3. Founder's forensic assessment — three passes, confidence increasing each time

### Pass 1

> "El Sauzal has a stronger chance than Telde of becoming a near-100% envelope municipality. But we
> cannot honestly claim 100% yet without running the parcel coverage test."

Why El Sauzal is a strong candidate:
1. The planning corpus exists and is structured — complete PGOU package with urban regulations,
   detailed planning sheets, unit area fichas, sector fichas, rural settlement fichas, protection
   catalogue (source: elsauzal.es PGOU page).
2. The SIPU model already fits PRYZM — the Canarias planning dataset, produced through Urbanismo
   en Red normalization and maintained by GRAFCAN, is structured (normalized geometry/attributes),
   not pure PDF archaeology (source: datos.canarias.es).
3. El Sauzal has fewer obvious blockers than Telde: smaller municipality, simpler urban fabric, one
   main PGOU framework, existing SIPU pattern already proven, dispatch already exists per audit.

The real 100% test chain: **ALL BUILDABLE PARCELS → SIPU zoning polygon → zone code → PGOU article
→ numeric parameters → 3D envelope.**

Possible killers:
1. Special planning areas — the PGOU contains urban units, sectors, rural settlements, and
   protected areas that may not share the same envelope logic.
2. Alignment/rasante gaps — official approval documents mention alignment/elevation issues
   incomplete in some areas (source: BOC 2011/249); envelope generation often fails not on height
   but on street alignment/frontage/setbacks.

**Probability table (pass 1):** El Sauzal ⭐⭐⭐⭐ High · Telde ⭐⭐⭐⭐ High · Adeje ⭐⭐⭐ Medium ·
Arona ⭐⭐⭐ Medium · Las Palmas ⭐⭐ Lower.

Recommendation: promote El Sauzal ahead of Telde for the first 100% proof attempt — smaller,
cleaner, already has the resolver pattern; if it works it becomes the Canary template.

### Pass 2 (deeper)

> "We have evidence that El Sauzal is a very strong 100%-candidate. We do NOT yet have proof of
> 100% envelope coverage."

What is PROVEN (per founder):
1. El Sauzal has the ingredients for full envelope generation — complete PGOU package (urban
   regulations, detailed planning fichas, UA fichas, sector fichas, rural settlement fichas,
   protection catalogue, alignment and rasante plans).
2. Legal information is not missing — El Sauzal exposes an urban information service
   (`eadmin.elsauzal.es/publico/territorio/informeurbanistico`) providing parcel-level urban
   conditions: permitted volume, allowed floors, setbacks, uses, affected regulations. This means
   the municipality already has a concept of parcel → urban conditions → buildable volume, closer
   to PRYZM's target model than municipalities where rules only exist as inaccessible documents.
3. The planning structure is known — the PGOU framework recognizes general planning, partial
   plans, special plans, detailed studies, and protection catalogues.

**Reframe:** the 100% question is not "does El Sauzal have rules" (it does) but "can PRYZM resolve
every parcel to the correct active rule source". The 100% proof test chain: Catastro parcel → SIPU
zoning polygon → PGOU qualification → FICHA/ordinance article → height+occupancy+setbacks+alignment
→ 3D envelope. Every parcel must end as ENVELOPE or LEGAL REFUSAL, never UNKNOWN.

Current blockers to 100%:
- **Blocker 1** — not all zone codes mapped yet (need all El Sauzal zone identifiers → all
  corresponding fichas → all numeric parameters; a transcription/normalization exercise).
- **Blocker 2** — alignment/rasante dependency: El Sauzal publishes dedicated ALINEACIONES Y
  RASANTES documentation — for many Spanish municipalities this is the missing piece; here it
  exists, which increases coverage probability.
- **Blocker 3** — special instruments (Planes Parciales, Estudios de Detalle, UA, protected areas)
  need inventory and explicit routing — existence does not kill 100%.

**Revised confidence table (pass 2):** El Sauzal Very high · Telde Very high · Adeje Medium-high ·
Arona Medium · Las Palmas Lower.

Why El Sauzal may beat Telde: smaller municipality, cleaner planning corpus, parcel urban
information service exists, full PGOU documentation easier to normalize.

Next build artifact: `EL_SAUZAL_COVERAGE_AUDIT` with input (SIPU geometry, parcel layer, PGOU
fichas, urban information rules) and output (total buildable parcels, generated envelopes, legal
refusals, unknown — acceptance `UNKNOWN=0`). Then `EL_SAUZAL_ENVELOPE_VERIFIED=true` would be
legitimate.

**Strategic conclusion (pass 2):** El Sauzal is probably the best first candidate for proving a
near-100% PRYZM municipality because the missing pieces appear to be engineering normalization, not
missing law. Next move (founder's words): "El Sauzal full extraction, not Adeje."

---

## 4. Honest framing — proven vs. hypothesis

| Claim | Status |
|---|---|
| Planning corpus (PGOU + fichas + alignment docs) exists and is structured | Founder-asserted, sourced to elsauzal.es / datos.canarias.es — **not independently re-verified by PRYZM in this pass** |
| SIPU dataset is machine-readable, GRAFCAN-normalized | Founder-asserted (hypothesis carried forward from prior Telde work) |
| Parcel-level urban-conditions web service exists (`eadmin.elsauzal.es`) | Founder-asserted, single source — **not independently confirmed reachable/parseable** |
| El Sauzal is a stronger 100% candidate than Telde | Founder's comparative judgment, not a measured result |
| `UNKNOWN = 0%` coverage | **Not proven** — explicitly flagged by the founder as the untested claim; requires the Phase 7 coverage audit to be run before any certification |
| Code state: dispatch exists, `EL_SAUZAL_ENVELOPE_VERIFIED = false` | Confirmed against the current repo (`esElSauzal.ts`, `siteDispatch.ts`) — this is the one fact independently checkable from code, not from the founder's pasted text |

---

## 5. Next action

Per the founder: run `EL_SAUZAL_COVERAGE_AUDIT` (Phase 7) before touching the certification flag.
This document does not authorize flipping `EL_SAUZAL_ENVELOPE_VERIFIED`; certification requires the
Phase 8 artifacts (`CAPABILITY-AUDIT.md`, `BLOCKER-AUDIT.md`, `verification/SIGNATURE.md`) and a
`SIG-ELSAUZAL-001` sign-off, none of which exist yet.

**Status: NOT IMPLEMENTED — queued for Canarias Sprint 1 (after the Fly.io production deploy)**
