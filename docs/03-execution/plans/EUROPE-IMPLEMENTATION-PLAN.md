# EUROPE SITE-INTEL — IMPLEMENTATION PLAN (Phase 0–2 execution)

**Status:** ACTIVE · **Created:** 2026-08-31 · **Authority:** the founder's 2026-08-31 directive
("once the audit is done continue and create an implement plan and once the clear and sound
implementation plan is done proceed with the implementation straight away") executed against
`audit/europe-site-intel/2026-08-31/REPORT.md` (§S 0–6 months) and `DECISION-SUMMARY.md`.
**Discipline:** every wave runs the session-standard protocol — file-disjoint lanes, executed
falsification controls, adversarial verify, no ceiling raised, no rival built, orchestrator owns
commits. When this plan and the REPORT disagree, the REPORT wins; when the REPORT and a probe
disagree, the probe wins.

## What this plan implements (and what it deliberately does not)

IN: the report's 0–6-month items that are pure engineering — canonical model, declarative rule
envelope + versioning, evidence-graph wiring, EE adapter, engine-debt seams, stop-item trials.
OUT (founder-gated, listed in §F below): NL DSO key request, licence-text fetch authorisations,
the three unresolved names, BUPi confirmation. OUT (later phases): everything in §S 6–24 months.

---

## WAVE E1 — FOUNDATIONS (4 lanes + verify)

### E1a — Canonical model (§I) as pure schemas
The 17 entities (Parcel, Building, Terrain, Road, Plan, Zone, Prescription, Restriction,
Regulation, Rule, Scenario, Envelope, DevelopmentPotential, Source, Evidence, Version,
Confidence) + the per-rule provenance JSON shape as Zod schemas in `packages/schemas`
(L0 purity — P5 hard gate applies: zero I/O, zero THREE, zero DOM). Import the state
vocabularies the report names (DK denominator codelist, NL IMOW value lists, LT ASGR fields)
as enums-with-provenance rather than inventing. Six-tier confidence enum
(authoritative-machine / authoritative-doc / deterministic / AI / human-validated / unknown).
**Acceptance:** `check-domain-purity` stays 0/165+; schemas round-trip the three worked
examples from REPORT §I; every field carries the provenance shape from BRIEF §11.

### E1b — Declarative rule envelope + versioning (decisions 3, 5, 8)
The thin rule format: JSON-Logic scalar bodies, RASE-style applicability annotation,
`valid_from`/`valid_to` on Rule + Plan, and a typed deterministic evaluator (no `any`, no
eval). **Pilot: migrate the Barcelona pack** — numbers/citations/predicates out of TypeScript
into data files validated by the E1a schemas, evaluated by the new evaluator, with the
EXISTING pack's outputs as the golden baseline (byte-compare the resolved parameters for the
pack's own test parcels; any delta is a finding, not a silent migration). The TS pack stays in
place until the data pack matches it 100% — then the TS body becomes a thin loader.
**Acceptance:** golden parity on all Barcelona test parcels; a point-in-time query
("what applied on 2025-01-01") answers from `valid_from`/`valid_to`; falsification = corrupt
one data value → parity test names the exact parameter.

### E1c — Evidence graph v1: wire the existing attribution layer (decision 8, §K)
The report measured the attribution layer AUTHORED but UNWIRED (L7 §10). Wire it: every
resolved rule parameter carries its evidence chain (parcel → zone → plan → regulation →
article → rule → calculation), the chain survives re-fetch, and the "why is max height X?"
query is answerable from stored evidence. No new store — adopt the existing layer's shapes.
**Acceptance:** an executed test resolves a Barcelona parcel and walks the full chain;
severing the wiring → the test fails naming the missing hop.

### E1d — Estonia adapter (decision 6; L4's proven probe)
The first new-country adapter under the §J interface: Maa-amet cadastre + ehitisregister +
PLANK, keyless WFS. The lane's Tallinn probe already proved per-plot ehitusõigus serves
FAR 2.1 / coverage 61% / height 17.4m / GFA 3500m² live — the adapter maps those to E1a
Rule objects with DIRECT provenance. Follow the §J adapter contract (source discovery,
fetch, schema mapping, semantics — no business logic in the adapter). Reuse the existing
adapter registries (L7 §6); `FetchOutcome` end-to-end.
**Acceptance:** the audited Tallinn plot resolves end-to-end (parcel → buildings → plan →
rules) with every parameter carrying source+confidence; a second, unseen EE parcel resolves
without code changes; refusals carry both numbers (C74).

### E1-VERIFY — adversarial
Re-runs one falsification per lane on a different subject than the lane used; checks P5
purity gate, golden parity, the evidence-chain walk, and EE live probes independently;
`safe_to_commit` gates the wave.

## WAVE E2 — ENGINE DEBT (after E1; §M, §S item 5)
Seam-1 `envelopeToMassing` adoption; the never-overstate CI property test (envelope must
never exceed the legal maximum on any axis — property-tested across the pack corpus); fix
the two overstating mechanisms the report names; APP GML 2.0 parser off official samples
(PL preparation, ahead of the 2026-11-30 transition).

## WAVE E3 — STOP-ITEM TRIALS (parallel to E2; decision 7)
Probe lanes, no deletions: (a) Mapterhorn terrain PMTiles trialled against the hand-written
compiler on the Barcelona/Madrid scenes — keep only the datum-lift + façade-rasant sampling
(legal requirements, L-584); (b) ES MDSnE / FR MNH zonal-stats probe replacing nDSM
differencing. Each trial ends in a measured verdict doc, and only a superseding commit
retires the old path (§L-1056 rule: no unwatchable behaviour change in passing).

## §F — FOUNDER-GATED ITEMS (blocking only what they name)
1. **NL DSO pre-prod + prod API keys — a form; the report says "this week".** Blocks the NL
   adapter only.
2. Four licence texts to fetch/authorise: Catastro Licencia.pdf, OME2, geoportal.lt,
   MS GlobalML LICENSE (live lane contradiction — VERIFY before any Microsoft-heights use).
3. Clarify or drop: "Polis" (FR), "Swiss Zoning API", "BZOdigital" — three names that
   resolved to nothing.
4. Confirm BUPi RGG openness (PT).

## Sequencing + collision control
E1 launches immediately and runs parallel to the in-flight 7B2 wave — the file surfaces are
disjoint (7B2: annotations/structural/command-registry/input-host; E1: packages/schemas,
the rule-pack/jurisdiction tree, a new EE adapter dir). Every E-lane brief carries the 7B2
file list as a DO-NOT-TOUCH set and refuses on contact. E2/E3 launch when E1 verifies.
DK corrections, NL adapter, LT ASGR, and the §S 6–12-month items queue behind E1/E2 and the
founder-gated keys.

---

# THE FULL WAVE LADDER (E4 → E11) — the documented path from E3 to "any address in Europe"

> Added 2026-09-01 on the founder's ask. Sources: REPORT §S (6/12/24-month roadmap),
> DECISION-SUMMARY rows 2/6, the lane evidence, and the E1 gate findings. Each wave gets its
> full lane briefs AT LAUNCH TIME from the then-current tree (this session's standing pattern);
> what is fixed HERE is scope, entry condition, and acceptance. The 20-parcel expected-grade
> baseline (impl/e1a-gate-supplement.md §10) runs at EVERY wave close and may only improve
> (shrink-only on MISSING, grow-only on DIRECT) — that table is the product's odometer.

## E4 — GATE FIXES + E1b/E1c COMPLETION (immediately after the E1 gate verdict)
The gate's minimum changes (expected: typed geometryRef referent contract; a machine-readable
validityBasis; a typed seat for the DK denominator; the thin Source Registry NOW per §7 of the
supplement) + resume E1bc (rule envelope, Barcelona golden parity, evidence wiring) and E1d
(Estonia) against the frozen model. ENTRY: the A–F verdict. ACCEPTANCE: E1's original
acceptance criteria + the gate's fixes each falsified; Estonia end-to-end on both named parcels.

## E5 — CONTEXT EUROPE (the "real LoD surrounding buildings" wave)
The buildings federation: Overture GeoParquet backbone + national LoD2 override (DE Länder,
NL 3D basisbestand, …) + EUBUCCO year/type joins, GERS as the conflation key, ODbL layers kept
SEPARABLE (the one architectural licence constraint); source-priority/dedup/height-confidence
rules per REPORT §16; terrain cutover per the E3 Mapterhorn verdict; roofer evaluated where
states publish no LoD2. ENTRY: E3 trial verdicts + MS GlobalML licence resolved (founder item).
ACCEPTANCE: any EU address renders parcel + neighbours at P1 (extruded mass) with LoD2 where a
national source serves it, provenance per building; the 20-parcel contextual rows all DIRECT.

## E6 — STRUCTURED-RULE COUNTRIES II (NL · LT · DK corrections · PL)
NL dual-regime (IMOW/DSO — ENTRY: the founder's API keys); LT ASGR live+FGDB (ENTRY: the
MAX_INTENS units resolution the audit named); DK keyless re-pin, denominator branch, 4-layer
ladder; PL after 2026-11-30 (Rejestr Urbanistyczny transition; APP GML 2.0 parser from E2).
ACCEPTANCE: each country's two baseline parcels resolve with rules DIRECT; refusals carry both
numbers; no adapter contains business logic (§9 boundary re-audited per country).

## E7 — THE NORDIC/STRUCTURED FAMILY (SE · FI · NO · LU · LV · SI)
One adapter FAMILY over the six one-national-channel countries (SE NGP + Planbestämmelse-
katalog, FI Ryhti, NO planregister+NAP, LU/LV/SI per lane 5) — shared vocabulary, per-country
mappers only. ACCEPTANCE: a new family member costs a mapper + a source-registry row, nothing
in core; six countries at Level-2 coverage.

## E8 — THE DOCUMENT-RULE PIPELINE (DE · FR · CH — where half of Europe's rules live)
ONE extraction pipeline, three corpora: DE XPlanGML fast-path (MV-class Länder) + the NRW 82k-
plan document index as the first corpus-scale run; FR règlement pipeline keyed on GPU idurba;
CH seeded from ÖREB's per-parcel law references. Every extracted rule: evidence-addressed
(page/article), AI-tier confidence, human-validation queue — the gate battery from the
existing extraction machinery extended, never bypassed. ENTRY: E4's rule format frozen; the
validation loop staffed (the audit's true scaling constraint). ACCEPTANCE: extraction
precision measured against a human-labelled sample per corpus BEFORE bulk runs; the DE/FR
20-parcel rule rows move MISSING→AI→HUMAN, never silently to DIRECT.

## E9 — TIME + PROOF PRODUCTISED
Evidence graph v2: point-in-time queries ("what applied on 2025-01-01") productised on the
E4 versioning; the coverage heatmap engine (C63 scorecard extended to the 30×7 matrix, fed
from the Source Registry, published); "why is max height X?" as a user-facing answer.
ACCEPTANCE: time-travel answers cite the superseded plan; the heatmap regenerates from data.

## E10 — DEVELOPMENT POTENTIAL (the product)
permitted − existing: existing GFA from ES DNPRC/wfsBU, EE EHR, DK BBR (all probed
consumable); the scenario engine (brief §3 scenarios); §34-context inference (DE) as the
flagship derived-envelope capability, always labelled DERIVED. ENTRY: E5 (existing buildings)
+ per-country envelopes from E6-E8. ACCEPTANCE: the DevelopmentPotential entity carries its
full evidence chain + time anchor (the gate's §6 finding); never-overstate holds on the
scenario outputs.

## E11 — EXPANSION TRANCHES (the long tail, by evidence not ambition)
ES autonomous communities (watch Andalucía/Galicia structured delivery) · PT (CRUS +
regulamentos; BUPi post-pricing-cliff) · IT northern mosaics · BE (Flanders DSI RDF first) ·
RO via QMAP partner evaluation · monitor SK/GR/BG/HU/CY. UK stays Product-A only (the audit's
structural verdict). Each tranche enters only with its lane-file evidence refreshed — the
audit rots; re-probe before building.

## What "done" means
The BRIEF §34 sentence, measured: any parcel in Europe → what exists (E5) → what rules apply
(E6-E8, tiered honestly) → what can be built (E2 engine + E10) → shown source-backed in 3D
(E9) — owning as little raw data infrastructure as possible. The 20-parcel table at every
wave close is the only progress claim this plan accepts.

---

# EXECUTION STATUS (updated 2026-09-01, from the waves themselves — re-read the commits, not this line)

| Wave | State | Evidence |
|---|---|---|
| **E1a** canonical model | ✅ landed, then **REVISED and FROZEN** | gate verdict REVISE-BEFORE-E1b → R-batch R1–R5 → `§H` freeze + `§RULEFORMAT-RATIFIED` (`1db0482a`) |
| **E1b/c** evaluator + evidence | ✅ **Barcelona golden parity 100% byte-identical** (11/11) | `1db0482a`; ratification stamps applied at close |
| **E1d** Estonia | ✅ live end-to-end on both baseline parcels | minted plan + prescription, `maxGrossFloorArea 3500 m² tier-1 DIRECT legal-dated` |
| **E2** engine debt | ✅ both overstating mechanisms dead · `check-envelope-never-overstates` registered (181 zone-solves, 6 jurisdictions) · Seam-1 adopted · APP GML 2.0 parser off the official XSD | `1db0482a` |
| **E3** stop-item trials | ✅ Mapterhorn **ADOPT** (behind the compiler, default OFF, `bd5134de`) · ES already-adopted re-verified · FR MNH **ADOPT** (existing sampler unmodified) | `impl/e3a-*`, `impl/e3b-*` |
| **E4** gate fixes + completion | ✅ closed with the A–G report | `E1-GATE-DECISION.md`, `1db0482a` |
| **E5** context Europe | 🔄 **investigation COMPLETE** (`9351eb41` + `cfd952ea`) · federation scaffold + terrain seam landed (`bd5134de`) · the buildings federation itself is the remaining build | 46-row DO-NOT-BUILD inventory; ES `conflation: bridge-file` |
| **E6** structured-rule II | 🔄 **DK ✅** (`bd5134de` — the denominator defect) · **LT ✅ PL ✅** (`01e27417`) · **NL blocked on the founder's DSO keys** | both LT/PL refusals are the deliverables |
| **E7** Nordic family | ⏸ entry: E6 landed — now true; generalises from EE/DK/LT as three working adapters. **LU joins it as a near-free member** (E5: CC0 GeoPackage at 93.7% fill) | |
| **E8** document pipeline | ⏸ entry: rule format frozen (✅) + validation loop staffed. **NREL COMPASS (BSD-3) adopted as the extraction spine** rather than built | E5 §D |
| **E9–E11** | ⏸ as documented above | |

**Standing blockers, all founder-side:** NL DSO API keys (a form) · MS GlobalML licence
(gates only the Microsoft leg of federation) · the three phantom names · BUPi.
**Standing engineering blocker:** L-12871 — three overlapping country bboxes must gain
precedence data BEFORE any of DE/PL/LT is registered as a parcel provider.
