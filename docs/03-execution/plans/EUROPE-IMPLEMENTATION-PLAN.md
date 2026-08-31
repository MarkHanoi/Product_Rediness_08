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
