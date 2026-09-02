# LANE C — AS-BUILT MAPPING · HARD CASES · RISK REGISTER (adversarial, read-only)

Audited 2026-09-02 at HEAD `0c90a2da`. Repo untouched; this file is the lane's only output.
Independent principal AEC data architect posture: every claim below carries a file path; where a
claim could not be verified it says NOT CONFIRMED.

**Scope caveat, stated first because it bounds T1.** The proposal DOCUMENT itself is not in the
repo, the scratchpad, or any audit directory (searched: `audit/**`, `docs/**`, scratchpad root,
git log since 2026-08-25 — no file states the proposal's box diagram). This lane maps the boxes
the lane brief names — **CONSTRAINT GRAPH · GEOMETRY KERNEL · LEGAL ENVELOPE stage** — plus the
companion boxes any such proposal necessarily implies (ingestion/adapters, provenance, context,
output massing). If the real proposal contains boxes not named here, they are unmapped and this
lane says so rather than guessing.

---

## T1 — RIVALRY CHECK: the proposal against the FROZEN model and the SHIPPED evaluator

### The frozen/shipped baseline the proposal lands on

- **Canonical model, FROZEN.** `packages/schemas/src/siteintel/` — 17 entities
  (`entities.ts:5–9`: Parcel, Building, Terrain, Road, Plan, Zone, Prescription, Restriction,
  Regulation, Rule, Scenario, Envelope, DevelopmentPotential, Source, Evidence, Version,
  Confidence, + Document), six-tier confidence (`confidence.ts`), per-rule provenance
  (`provenance.ts` — `RuleProvenanceSchema` with R2 `valueBasis`, R3 `validityBasis`,
  R5 `normativeForce`), R1 typed applicability (`entities.ts:306–390`,
  `RuleApplicabilitySchema` with `basis`/`geometry`/`useScope`/`rank`/`condition`).
  Freeze stamp: `ruleformat.ts:1–13` — "§RULEFORMAT-RATIFIED (2026-09-01, Wave E4 close) —
  FROZEN … changes require a superseding ADR, exactly like the E1a envelope … frozen since the
  R-batch."
- **Freeze governance.** `audit/europe-site-intel/2026-08-31/E4-EXECUTION-CONTROL.md` controls
  1–3: architecture gate NOT reopened without a concrete implementation test; NO additional
  canonical entities/fields/abstractions; model FREEZES after R1–R5. Control 7:
  "SOURCE ≠ EVIDENCE ≠ RULE ≠ CONSTRAINT ≠ ENVELOPE — the distinctions are preserved."
- **Declarative evaluator, SHIPPED at Barcelona byte parity.**
  `packages/site-parcel-data/src/rulepacks/declarative/{evaluateDeclarative.ts,
  deriveC58Contract.ts, factVocabulary.ts, esBarcelona20aAillada.decl.json}`;
  parity record `audit/europe-site-intel/2026-08-31/impl/lane-e1bc-evaluator-golden-parity.md`
  ("declarativeGoldenParity 11/11 with FULL byte parity").
- **The envelope engine, SHIPPED and gate-guarded.**
  `packages/site-parcel-data/src/ZoningRulesEngine.ts` (`computeBuildableEnvelope`, C58 §3.2,
  L2-pure, jurisdiction-agnostic) + ~14 geometry modules in
  `packages/site-parcel-data/src/geometry/` + `envelopeToMassing.ts` (STRUCTURAL-SEAM-1) behind
  `packages/site-parcel-data/src/l449CertificationGates.ts` and
  `tools/ga-gate/check-envelope-never-overstates.ts`.
  REPORT verdict, verbatim: "**PRYZM HAS a deterministic envelope engine and it is the confirmed
  IP core. The verdict is EXTRACT-INTO-CORE, not replace**"
  (`audit/europe-site-intel/2026-08-31/REPORT.md` §M).

### Box-by-box mapping

| Proposal box | As-built disposition | Named module(s) |
|---|---|---|
| **"Constraint graph"** — a graph of resolved constraints per parcel/zone | **RENAME of frozen machinery, RIVAL if minted as a model.** The concept is already decomposed — deliberately — into Rule (with typed `applicability.basis` refs to Zone/Prescription/Plan/Restriction/Regulation/Parcel, `entities.ts:306–320`), Prescription/Restriction (the geometric constraint entities, `entities.ts:230–273`), rank-laddered precedence resolved ENGINE-side ("RESOLUTION stays in the engine … no precedence algorithm lives in the data model", `entities.ts:324–329`), and the Evidence graph (`EvidenceRefKindSchema`, 9 ref kinds). E4 control 7 keeps RULE and CONSTRAINT distinct **by design**; a "ConstraintGraph" entity would collapse that distinction and is exactly the "additional abstraction" control 2 forbids without a demonstrated failure. | `packages/schemas/src/siteintel/entities.ts`, `evaluateDeclarative.ts` |
| **"Geometry kernel"** | **EXISTS — and the term is a double hazard.** (a) The envelope geometry core exists: ~7,300 lines pure L2 (`REPORT.md §M`) — `insetPolygon.ts` (per-edge setbacks), `blockDerivedDepth.ts` (PGM Art. 242.2 bisection, independent-oracle-audited), `blockConcentricBand.ts`, `depthBandClip.ts`, `occupationCappedDepth.ts`, `explicitArea.ts`, `buildingLineOffset.ts`, `streetWidth.ts` + `rulepacks/ampladaDeVial.ts` (street width — constructed, no national source exists), `facadeRasantDatum.ts` (the legal height datum), `polygonClip.ts`, `nativeCrs.ts`. (b) `packages/geometry-kernel/` **already exists and is a different thing** — the L2 BIM geometry package (CLAUDE.md layer table). A proposal box named "geometry kernel" collides with a shipped package name in this monorepo; whatever is built must not carry that name. | `packages/site-parcel-data/src/geometry/*`, `packages/geometry-kernel/` |
| **"Legal envelope" stage** | **EXISTS TWICE, with the rivalry already adjudicated.** `BuildableEnvelope` (C58, `packages/schemas/src/site/zoning/BuildableEnvelope.ts`) is THE scene-space determination with the refusal vocabulary; `SiteIntelEnvelope` (`entities.ts:565–613`) is the catalogue record (`isUpperBound` required-no-default, `derivationTrace`, `ruleSetVersion`, `determinationRef` → C58) and "any conflict resolves in C58's favour" (`entities.ts:566–572`). A THIRD envelope authority is the headline C84 EI-9 defect — two authorities for one concept — and the schemas' own index says so: "a second export path is how one concept grows two names" (`siteintel/index.ts:24–25`). | `BuildableEnvelope.ts`, `entities.ts` |
| Rule/data ingestion, per-jurisdiction | **EXISTS.** `packages/site-parcel-data/src/countryAdapters/{dk,ee,fi,fr,lt,lu,no,pl,pt,se}/`, ~100 rulepacks in `src/rulepacks/`, `src/parcelProviders/`, `src/providers/`, `nationalJurisdictionResolver.ts`; adapter interface designed in REPORT §J (formalise the two existing registries, "do not rebuild"). | as listed |
| Document→rule extraction | **EXISTS.** `packages/ordinance-extraction/` (spine, gates, grammars, attribution with instrument-priority tables — `src/attribution/{priority,resolve,tables}`). | `packages/ordinance-extraction/src/` |
| Provenance / evidence | **EXISTS AND IS FROZEN.** `RuleProvenanceSchema` composed WHOLE into `SiteIntelRuleSchema` ("drift between 'a rule' and 'a rule's provenance' is unrepresentable", `entities.ts:395–401`); E1c evidence chain emitted by the evaluator (`lane-e1bc-evaluator-golden-parity.md`: "zone → plan → document → article → rule → verbatim → calculation → value; `walkEvidenceChain` fails naming the missing required hop"). | `provenance.ts`, `evaluateDeclarative.ts` |
| Context / as-is buildings | **EXISTS.** `packages/site-parcel-data/src/buildingsFederation/{conflate,gersId,sourcePriority,odblStore}.ts`; context tiles `tools/context-bake/` + PMTiles on R2. | as listed |
| Output massing | **EXISTS.** `envelopeToMassing.ts` — "the ENGINE emits the solid; the render only rasterises it." | `packages/site-parcel-data/src/envelopeToMassing.ts` |

### The demanded verdict, explicitly

**As briefed, the proposal is an accidental REDESIGN, not an evolution seam.** Every one of its
three named boxes has a shipped, frozen, or gate-guarded authority; inserting them as new stages
re-mints RULE-vs-CONSTRAINT (control 7), re-mints an envelope authority (C84 EI-9), and collides
with an existing package name. The repo retired a rival runtime this very week
(`createFamilyEditorRuntime`, baselined not allowlisted — CLAUDE.md P1 note, ADR-0316), and the
E4 wave's whole discipline (controls 1–3, 10) exists to prevent precisely this insertion.

**The defensible evolution seams are two, and they are narrow:**

1. **A true-3D solid stage** consuming C58 `BuildableEnvelope` outputs. The as-built envelope is
   2.5-D — prismatic tiers (`EnvelopeTierSchema`: polygon × baseHeight × maxHeight;
   `SiteIntelEnvelopeSolidSchema`: footprint extruded between two heights). Sloped bounding
   planes (DE Abstandsflächen, Paris héberges/gabarit, roof-plane envelopes, the rasant trams of
   Art. 240.1.c) have no solid representation yet. A stage that CONSUMES
   `BuildableEnvelope` + `facadeRasantDatum` trams and emits non-prismatic solids — carrying the
   per-tier/per-tram rule attribution forward (T4) — is new capability, not a rival, PROVIDED it
   adds solid kinds additively (the discriminated-union pattern `GeometricRule.ts:37–42`
   documents as the sanctioned growth channel) and its output goes through/beside
   `envelopeToMassing`, never around it.
2. **A materialised per-parcel evaluation cache** ("the constraint graph" as a CACHE, not a
   model): a stored join of `SiteIntelRule` ids + `Evidence` ids + `DerivationTrace`, keyed by
   `(parcelId, ruleSetVersion, asOfDate)`. Acceptable only if it stores REFERENCES into the
   frozen entities and re-derives on `ruleSetVersion` change; the moment it stores copied values
   with its own shape it is a second planning database — the thing E4 control 6 forbids the
   Source Registry from becoming, and the same prohibition applies here.

Everything else in the proposal must be expressed as CONSUMPTION of `SiteIntelRule` /
`DeclarativeRulePackDocument` / `BuildableEnvelope` outputs or it should not be built.

---

## T2 — AS-IS vs LEGAL: the Catastro discovery and the boundary

Sources read: `audit/europe-site-intel/2026-08-31/ES-CATASTRO-3D-MEMO.md` (440 lines) +
`impl/es-catastro-3d-investigation.md` + `impl/e5-devpotential-categories.md`.

### What the AS-IS channel is FOR — four legitimate uses, and one forbidden one

The memo's one-line answer sets the frame: "Footprint-per-floor YES; metric heights NO;
buildable envelope NOTHING … Spain's cadastre encodes storeys, not heights" (§THE ONE-LINE
ANSWER), and §F answers Q9 with "**NOTHING. Zero machine-readable planning content**," proven
five independent ways.

1. **Existing-volume/GFA subtraction for remaining potential (E10).** The canonical seat already
   exists: `SiteIntelDevelopmentPotentialSchema` (`entities.ts:617–660`) — permitted − existing,
   with a `superRefine` that forces `deltaGfaM2 = null` when either side is unknown (UNKNOWN ≠ 0).
   ES existing GFA is DIRECT nationally (DNPRC/wfsBU — REPORT §R GFA row: "permitted−existing
   computable TODAY in ES"). Per-floor geometry is EXPLICITLY routed to E10, not E5 federation
   (memo §E.2: three disqualifying facts — no bulk at any tier, territorial coverage with
   Barcelona a 0/5 miss, undocumented endpoint).
2. **Consolidation checks** — same channel, same E10 seat; the state-served comparator exists
   elsewhere (FI SeutuRAMAVA computes reserve = right − used; `e5-devpotential-categories.md`
   §A-1) and is the model for what PRYZM computes where the state does not.
3. **Fabric-derived ordinance inputs** — where the LAW ITSELF keys on the as-is fabric:
   Porto *moda da cércea* (needs the C58 `fabricDerivedHeight` kind —
   `docs/04-reference/jurisdictions/pt/COUNTRY-RATE.md:78,93`), DE §34 Einfügung
   (REPORT §H.4 row 7 — MUST-BUILD), and the shipped-but-shut
   `providers/contextDerivedStudyEnvelope.ts` (median-neighbour-height STUDY, own l449 gate
   `CONTEXT_DERIVED_STUDY_ENVELOPE_CERTIFIED`, shut; "never asserts a legal right to build").
   Here as-is data is a legal INPUT — but only because a rule names it, and the output is still
   the rule's, not the fabric's.
4. **Neighbour context rendering / LoD massing** — `buildingsFederation/`, D.1 geometry ladder
   (city LoD2 > Catastro BuildingPart decomposition > threshold-union per-floor > FXCC KML
   on-demand > Overture > never EUBUCCO for ES).

**Never a legal ceiling.** The memo makes this a named refusal, C7: deriving any
envelope/height/GFA allowance from a ponencia coefficient is forbidden because RD 1020/1993
permits it to be "the mean or mode of what already stands — reading it as permitted buildability
is exactly the SURVEYED-as-NORMATIVE overstatement the never-overstate gate forbids." The same
class error is pre-armed at three more doors: `CP:CadastralZoning` is cadastral subdivision, not
zoning ("a category error with an INSPIRE citation attached", §F); the UR/RU flag is a tax flag
that lags the plan (§F); `heightBelowGround` is "a source-side tier-3 inference wearing a tier-1
attribute's clothes" (§A.3) — it is `3 × floors` at source, 27,005/27,005 exact.

### Where the boundary must be enforced — the typed seats ALREADY EXIST

- **`BuildingHeightMethodSchema = ['SURVEYED','MODELLED','DERIVED_FLOORS']`**
  (`entities.ts:101`) — the surveyed≠normative axis on every Building height.
- **R2 `valueBasis` + `derivation` + tier-coherence `superRefine`** (`provenance.ts`): tier 1 +
  AI_EXTRACTED is a parse error; tier 1 + in-document-text is a parse error; value null only at
  tier 6. A Catastro-derived number entering the rule plane arrives tier-3/DERIVED or it does
  not parse.
- **`isUpperBound` on `SiteIntelEnvelope` — REQUIRED, no default** (`entities.ts:585–591`), and
  the C58 refusal vocabulary (`BuildableEnvelope.ts:244–265`).
- **The E5-vs-E10 channel split as governance**, not preference: memo §E — "DATA, NOT
  ARCHITECTURE. NO ARCHITECTURAL CHANGE IS REQUESTED"; per-floor geometry recorded for E10 under
  control 10.
- **Gates:** `tools/ga-gate/check-envelope-never-overstates.ts` (planted-pack self-test, exit-2
  honesty floors) and `tools/ga-gate/check-unvalidated-claim-not-a-constraint.ts`; any
  context-derived DISPLAY sits behind its own signed l449 gate
  (`l449CertificationGates.ts` §L449-SIGNATURE-TOTALITY).

**For the proposal:** the AS-IS channel must enter the pipeline as `SiteIntelBuilding` +
`DevelopmentPotential.existing` (with `source`), never as a Rule and never as an envelope input
except through a named `fabricDerivedHeight`-class rule kind. If the proposal's constraint graph
has an "existing buildings" node feeding the legal-envelope stage directly, that edge is the
overstatement path and must be cut.

### The specific confusion risks (the 43% trap, found, plus its family)

- **The 43% basement over-height trap** — memo §H7 defence D1: the per-floor KML stacks sótano
  bands into above-ground fabric on naive ingest; "a naive ingest over-heights `2255407VK4725E`
  by **43%**"; deterministic fix = subtract `3 m × (true sótano levels)`, rule exact 4/4
  (also `impl/es-catastro-3d-investigation.md:683,763` — the defence is E10's, not E5's).
- Defences D2–D4 ride with it: absence has three shapes none of which is an HTTP error (a
  well-formed 5,886-byte KML with 0 polygons passes any validity check — gate on polygon count);
  the prolog lies about encoding; floor labels are free text needing a parser WITH a refusal
  branch and fixture corpus.
- **The semisótano ordering trap** (§F.1): FXCC "instructs producers to misorder the stack to
  satisfy a validator — never stack on `.asc` sequence; key on the floor code."
- **Computable ≠ physical area** (§F.1): `TZA`/`SOP` recorded post-50%-coefficient.
- **No single official Spanish GFA** (§A.3): four official channels, 1.7% spread — name the
  channel or do not present the figure as exact.
- **Footprint vs roof** (§F.1): Catastro serves footprints, MDSnE measures roofs — eaves
  overhang biases every zonal join.
- **The rasante gap is LEGAL, not cosmetic** (§F + H10, L-584 family): no ground datum anywhere
  in Catastro; above a slope threshold the honest answer is a refusal, not a centroid sample.

---

## T3 — HARD CASES, each with a verdict

| # | Hard case | Verdict | Evidence |
|---|---|---|---|
| 1 | **Sloped terrain + height DATUM (L-584)** | **HANDLED** (Barcelona, at the ordinance's own letter); **handled-with-changes** elsewhere | `packages/site-parcel-data/src/geometry/facadeRasantDatum.ts` transcribes PGM Art. 240.1 a/b/c verbatim — including the ≥0.6 m two-branch rule and the 240.1.c mandatory façade subdivision into independent trams (`RasantTram`, `RasantRule = 'art-240-1-a'|'art-240-1-b'`, `RasantRefusalCode`). Wired: exported via `src/index.ts`, consumed by `apps/editor/src/ui/geospatial/globeGroundAnchor.ts`. The residual: those constants are PGM-specific; other countries' datum rules must arrive as pack data (the engine stays rule-agnostic), and Catastro memo H10 orders a slope-threshold REFUSAL where no datum resolves. The pipeline must inherit the tram model, not re-derive a centroid sample — the exact defect this module retired. |
| 2 | **Corner lots, two street alignments** | **HANDLED** (BCN); **handled-with-changes** (per-pack elsewhere) | Art. 240.3 BOTH branches are transcribed in `facadeRasantDatum.ts` ("operating on the developed façades as if one", and the greater-height carry-around with the 30 m cap). Per-edge machinery exists: `ParcelEdgeClassification` per edge, `insetPolygonPerEdge`/`PerEdgeSetbacks` (`geometry/insetPolygon.ts`), street width per front (`rulepacks/ampladaDeVial.ts`, `bcnOfficialStreetWidths.ts`), height-by-street-width (`bcnAlcadaReguladora.ts`). |
| 3 | **Neighbour-context rules** (Porto moda-da-cércea · DE Abstandsflächen on neighbour land · Paris héberges) | **BREAKS-IT today; evolution path already named by the repo** | Porto: C58 gap NAMED — `fabricDerivedHeight` GeometricRule kind required (`docs/04-reference/jurisdictions/pt/NEXT.md` §3.6, `COUNTRY-RATE.md:93`); today PT ships zone-NAMED cited refusals (commit `73f3e2e6`). DE: `contextDerivedStudyEnvelope.ts` covers the §34 STUDY only, gate SHUT; Abstandsflächen (per-Land multiplier/minimum — `docs/04-reference/jurisdictions/de/GERMANY.md:109`) need sloped planes (see T1 seam 1) plus neighbour-parcel geometry injected the way `blockRing` is ("INJECTED, NEVER FETCHED" — `ZoningRulesEngine.ts:66–72`). Paris héberges: **zero repo hits**; FR today = zone-ID + cited refusal, numbers never invented (commit `35baaabd`). The honest posture holds meanwhile: these parcels REFUSE with citation rather than overstate. |
| 4 | **Existing buildings on parcel** (consolidation, remaining GFA) | **HANDLED at the model; computation is E10's** | `SiteIntelDevelopmentPotentialSchema` with the null-propagating superRefine (`entities.ts:617–660`); `capacityComparison.ts` (designed-vs-permitted, "UNKNOWN IS NOT COMPLIANT"); ES existing-GFA DIRECT nationally (REPORT §R); FI SeutuRAMAVA as the state-served comparator (`impl/e5-devpotential-categories.md` §A-1). |
| 5 | **Plan hierarchies + temporal validity** (which version governs; EE detail- vs üldplaneering; ES transitional regimes) | **HANDLED** | R1 `rank` — national instrument ladder, precedence resolved engine-side, "tie/incomparable = refusal, never a guess" (`entities.ts:324–336`, `lane-e1bc-evaluator-golden-parity.md`); R3 `validityBasis` legal-vs-ingestion kills the confident false negative (`provenance.ts`); `isInForceOn` (`ruleformat.ts`), `SiteIntelVersion`, `Scenario.asOfDate`. EE: `countryAdapters/ee/eePlanProvider.ts` (dp_kehtiv · detailplaneering layers). NL dual-regime merge is a first-class adapter capability generalised to SE/PL/EE (REPORT §J). ES transitions: `'regime-undetermined'` refusal code (`BuildableEnvelope.ts:244ff`). |
| 6 | **Overlays and exceptions** (flood/heritage/airport) | **HANDLED at the model + per-jurisdiction providers; coverage is data work** | `SiteIntelRestrictionSchema` (`entities.ts:255–273`, geometry-or-share, lawStatus, document refs); shipped providers `resolveCatalunyaFloodOverlay.ts`, `resolveBarcelonaHeritageOverlay.ts`, `catalunyaAiguaEspaiFluvial.ts`, `resolveBalearsMuib.ts`; `'overlay-uncertain'` refusal code; and RASE's `exception` member is MANDATORY-CARRY: "An exception PRYZM cannot check must still be CARRIED — dropping it silently converts a conditional rule into an unconditional one" (`ruleformat.ts`). Airport cones: no provider found — a coverage gap, not an architecture gap. |
| 7 | **MIN constraints** (build-to lines, MIN_HEIGHT) — non-monotone, possibly EMPTY feasible set | **Empty set: HANDLED. MIN-as-obligation: handled-with-changes — a genuinely NEW axis** | Empty set: `insetPolygon.ts` returns `{polygon: [], degenerate: true}` (no crash, no garbage); envelope status `'degenerate'` = "setbacks consumed the whole parcel … the UI shows the reason, never a fabricated volume" and `'not-applicable'` = a POSITIVE cited no-envelope answer (`BuildableEnvelope.ts:148–170`); a refusing zone draws NOTHING through `envelopeToMassing` and is COUNTED by the never-overstate gate; unbuildable land-class → cited refusal (§SIU-GUARD, commit `23890d56`). Build-to lines exist as alignment-offset-0 (`rulepacks/esMadridPgoum97.ts:463` "mandatory build-to line, hence offset 0"). BUT minimum HEIGHT exists only in ordinance prose inside height-construction comments (`bcnAlcadaReguladora.ts:258`, `esBarcelonaZoneClassification.ts:1073`); `EnvelopeTierSchema` has no `minHeight`/obligation axis, and the never-overstate gate is one-directional — nothing certifies "never UNDERSTATE an obligation." The frozen Rule CAN carry a min constraint (open `parameter` vocabulary + R5 `normativeForce`), so the MODEL survives; the geometry stage and the gate suite need a new, additive obligation half. **Do not encode MIN by abusing `isUpperBound`.** |
| 8 | **Phased development** | **BREAKS-IT — no machinery, and no benchmark chain demanded it** | Only textual hit is FI registry prose (`sourceRegistry/fi.ts:40`). `Scenario` + Plan validity windows could approximate phases badly. Per E4 control 10: record for a later lane; do not let the proposal use this gap to justify a redesign of the frozen model. |
| 9 | **The 20-parcel benchmark's own refusal rows** | The proposal must REPRODUCE these refusals, not solve past them | `REPORT.md` §R: Parcel 5% MISSING (central Lisbon — "genuine absence, not a gate"); Restrictions ~31% partial/unknown (least-graded step); **Numeric rules 50% AI-EXTRACTED** (DE-Cologne, CH×2, ES×2, FR×2, PT×2, EE-A — doc URL machine-served in every case); **Envelope 0% state-served in all 20** ("PRYZM IP in all 20 chains"); GFA ~25% blocked-on-rules (FR/PT/ES-Madrid). Any pipeline emitting an envelope on the F-fork chains without the gate-verified extraction path (tier 4→5 only by recorded human validation — `provenance.ts` tier-5 superRefine) violates the never-overstate doctrine at the benchmark's own rows. |

---

## T4 — PROVENANCE · EXPLAINABILITY · TEMPORAL · PERF

### Can "why this height?" trace from a 3D face to source document + validity dates? — YES, today, and the proposal must not break the thread

The as-built chain, link by link:

1. **Solid → tier:** `envelopeToMassing.ts` consumes the WHOLE `BuildableEnvelope` — every drawn
   solid derives from a named tier or the principal scalars, never re-derived render-side.
2. **Tier → article:** `EnvelopeTierSchema.ordinanceRef` — "The paragraph that grants THIS tier —
   tiers of one envelope cite different articles" (`BuildableEnvelope.ts`). A tier's height cap
   being null is itself a finding ("a real permitted REGION with no published vertical limit —
   never a licence to extrude a default").
3. **Number → derivation:** `DerivationEntrySchema` per resolved constraint — constraint, value,
   zoneCode, source, fieldProvenance, ordinanceRef (`BuildableEnvelope.ts:133–146`); threaded
   from `ZoningRecord` per-document ids ("The engine threads this into every
   `DerivationEntry.ordinanceRef`", `ZoningRecord.ts:47`).
4. **Rule → legal address + validity:** `RuleProvenanceSchema` — source
   {country, authority, dataset, plan_id, object_id, document, article, page}, derivation,
   confidence tier, `valid_from`/`valid_to`, R3 `validityBasis` (`provenance.ts`); RASE verbatim
   spans for human review (`ruleformat.ts`).
5. **Chain walk:** the evaluator "emits the E1c evidence chain (zone → plan → document → article
   → rule → verbatim → calculation → value); `walkEvidenceChain` fails naming the missing
   required hop" (`impl/lane-e1bc-evaluator-golden-parity.md`), through the EXISTING attribution
   layer (`@pryzm/ordinance-extraction` `attribution/{priority,resolve,tables}`). Evidence nodes
   carry method, checkedDate, and a content hash for tamper-evidence (`entities.ts`,
   `SiteIntelEvidenceSchema`). The catalogue envelope pins `derivationTrace[]`,
   `confidenceTier` (weakest input governs), `computedAt`, `ruleSetVersion`
   (`entities.ts:565–613`). The external design model is ÖREB — consume, never rival
   (REPORT §K; §H.3 row 6).

### What the evidence chain requires of the proposed GEOMETRY stage

- **Per-face rule attribution is the price of admission.** Attribution today is per-TIER
  (prisms). The moment solids acquire sloped faces (Abstandsflächen planes, rasant trams,
  gabarit profiles), each FACE must carry the tier/tram/rule id that grants it —
  `facadeRasantDatum.ts` already shows the pattern (`RasantTram` + `RasantRule` +
  `RasantProvenance` per tram). A geometry stage returning bare B-reps severs links 1–2 and is
  the "provenance divergence" failure of T5 made concrete.
- **Refusals must remain first-class geometry outcomes**: degenerate/not-applicable/refusal
  states render as their reasons, never as absent geometry (`BuildableEnvelope.ts:148ff`,
  `envelopeToMassing` draws nothing on refusal and the gate counts it).

### Perf and caching — what is cacheable, and what the never-overstate gate must re-walk

Cacheable (with the key the as-built already defines):
- **Per-zone rule content** — the declarative pack document is a static data file; the derived
  C58 contract is a pure load-time function (`deriveC58Contract.ts`). Cache key:
  pack `lastReviewed` / `ruleSetVersion`.
- **Parcel + zoning fetches** — `server/jurisdiction/parcelZoningProxy.js` runs a 7-day cache
  (cited by Catastro memo B2 as why PRYZM survives on the fragile ES host).
- **Context** — pre-baked PMTiles on R2 (`tools/context-bake/`); bulk mirrors per REPORT §H.1
  option C; block rings per block.
- **Computed envelopes** — `SiteIntelEnvelope` carries `computedAt` + `ruleSetVersion`
  precisely so a cache can key `(parcelId, ruleSetVersion, asOfDate)`; `Scenario.envelopeRef`
  is the memoisation seat.

NOT cacheable per zone: the pack `constructions` — per-parcel JSON-Logic over parcel/street
facts ("their value does not exist without parcel facts", `ruleformat.ts`); street-width
construction; block-derived depth; the SIU land-class pre-check; anything behind a live-currency
requirement (ÖREB extracts are strictly query-only — "never cache stale law", REPORT §H.1).
Also DO NOT cache across a WAF boundary lesson: per-host rate postures differ and must never be
averaged (memo §B, Resolution 3).

**What the never-overstate gate must re-walk:** on ANY change to pack content, evaluator,
engine geometry, or `envelopeToMassing`, `check-envelope-never-overstates.ts` re-solves EVERY
registered pack through the REAL engine and REAL rasteriser (it reads the registry live, "never
a transcribed list") and re-fires both planted self-tests (engine teeth + checker teeth), with
exit-2 honesty floors for "looked nowhere". Consequence for the proposal: a caching or
constraint-graph layer inserted BETWEEN engine and render creates bytes the gate never walked —
the gate would certify a path users no longer see. Any new stage must either sit on the gate's
walked path or extend the gate first; and cached envelopes must be invalidated by
`ruleSetVersion`, never by TTL alone (a TTL-fresh envelope computed under a superseded rule set
is a stale legal claim with a valid timestamp).

---

## T5 — RISK REGISTER + DO-NOT-BUILD

### Risk register (each with the as-built prohibition/precedent)

1. **Over-abstraction: the "universal" engine accreting country switches inside the kernel.**
   Forbidden by E4 control 5 (country semantics in adapters; generic evaluation/geometry
   country-agnostic) and DISPROVEN as necessary by the as-built: `ZoningRulesEngine.ts` header —
   "Jurisdiction-agnostic (C58 §1.5): zero jurisdiction-specific logic … Adding DK/ES is a new
   pack, never an engine edit"; ~100 rulepacks as data. The sanctioned growth channel is a new
   `GeometricRule` union variant (compile-error exhaustiveness — `GeometricRule.ts:37–42`).
   The tell in review: any `switch (country)` or country string literal in the kernel.
2. **Geometry logic leaking into adapters** (the inverse leak). The as-built rule: adapters map
   semantics and INJECT geometry, never solve — `blockRing` is "INJECTED, NEVER FETCHED … the
   engine stays pure and has no idea where it came from" (`ZoningRulesEngine.ts:66–72`); DK
   mapping stays in `rulepacks/dkPlandataEnvelope.ts` / `providers/mapPlandataToZoningRecord.ts`.
   A proposal whose adapters emit ready-made solids has moved the law into per-country code and
   defeated both the gate suite and the parity discipline.
3. **Provenance divergence between graph and geometry.** The frozen model made rule-vs-provenance
   drift UNREPRESENTABLE by composition (`entities.ts:395–401`); a constraint graph that COPIES
   values out of rules re-opens the drift the composition closed. Mandate: the graph stores rule
   ids and evidence refs; values are read through, never duplicated. (Same lesson at gate level:
   `l449CertificationGates.ts` — "the `value` IS READ FROM THE CONSTANT, NEVER RESTATED.")
4. **Licensing of context datasets inside a LEGAL determination.** The ODbL boundary is enforced
   structurally — compile-time phantom brand + runtime named refusal, no relabel API
   (`buildingsFederation/odblStore.ts`); priority table separates licence class from shape-wins
   (`sourcePriority.ts`; MS-GlobalML row EXCLUDED pending founder licence reading). Live
   exposure: `blockRing` may be resolved "from Catastro or the OSM roads layer" — an ODbL input
   feeding a legal depth computation is both a share-alike and an evidentiary-quality question;
   the derivation trace must name it. ES-specific: the three ES registry licence rows are WRONG
   (CC-BY-4.0 claim refuted; custom DGC transformation licence with four duties — memo E-1/H1,
   open); CartoBCN 107 licence NOT CONFIRMED; never re-serve raw cadastral artefacts or brand
   output "cartografía catastral" (memo C8/licence verdict).
5. **Municipality-specific hidden logic.** Existing smells the proposal could amplify:
   `sevillaFondoClip.ts` sits at package top level beside the engine; the Madrid SPACM family is
   seven modules (`rulepacks/esMadridSpacm*.ts`). The l449 header records how naming-convention
   blindness let `MADRID_NZ1_CERTIFIED` flip itself invisibly ("invisible to the guard by BOTH
   the directory and the naming convention") — a new stage adds a new namespace in which the
   same trick works again unless its gates are registered in the SAME signature-totality table.
6. **Rivalry with frozen/shipped machinery — the headline class (C84 EI-9).** Precedents this
   month: the rival runtime baselined-not-allowlisted (CLAUDE.md P1, ADR-0316); the full-stack
   brief's standing table of five ordered fixes that would have MINTED RIVALS of built-but-unwired
   machinery (`audit/full-stack/BRIEF-QUEUED.md`). The E-wave's own instrument: the Catastro
   investigation explicitly requested NO architectural change (memo §E) and the federation lane
   needed "no new entity, no new field, no new tier, no new matcher and no new abstraction."
7. **Renaming-around the gates.** Any envelope-shaped output not walked by
   `check-envelope-never-overstates.ts` and not behind a signed l449 gate reproduces the Madrid
   self-flip defect; and three rival commandManager counters with three verdicts (CLAUDE.md P4
   note) is the standing exhibit of what a second counter of one concept does.
8. **Name collision:** "geometry kernel" is already `packages/geometry-kernel` (BIM, L2).
   Whatever ships must not reuse the name.

### DO-NOT-BUILD (the repo already owns these)

| Never rebuild | Owner (path) |
|---|---|
| The canonical model (17 entities, R1/R2/R3/R5) — FROZEN; ADR to change | `packages/schemas/src/siteintel/{entities,provenance,confidence,ruleformat,json}.ts` |
| The confidence ladder (6 tiers; envelope-determination ladder; generic metadata wrapper) | `siteintel/confidence.ts` · C58 `EnvelopeConfidence` · C62 `site/metadata/` |
| The source registry (THIN by control 6) | `packages/site-parcel-data/src/sourceRegistry/*` + `defineSources.ts` |
| Certification governance (signature totality, publication authorisation, ADR-0283 doctrine) | `l449CertificationGates.ts` · `rulepacks/envelopeAuthorisation.ts` |
| The extraction spine (gates, grammars, attribution/priority tables) | `packages/ordinance-extraction/src/` |
| The declarative rule format + evaluator + loader (CONTRACT since 2026-09-01) | `siteintel/ruleformat.ts` · `rulepacks/declarative/{evaluateDeclarative,deriveC58Contract,factVocabulary}.ts` |
| The envelope engine + geometry corpus ("EXTRACT-INTO-CORE, not replace" — REPORT §M) | `ZoningRulesEngine.ts` · `src/geometry/*` · `envelopeToMassing.ts` |
| The evidence chain / attribution binding | evaluator E1c chain + `ordinance-extraction/attribution/` |
| The refusal + honesty machinery (refusal codes, FetchOutcome, degenerate/not-applicable) | `site/zoning/BuildableEnvelope.ts` · `site/zoning/FetchOutcome.ts` |
| LoD200 context + federation (GERS conflation, ODbL boundary, PMTiles bake) | `buildingsFederation/*` · `tools/context-bake/` |
| Parcel resolution (nine countries live, national resolver, 7-day proxy) | `parcelProviders/` · `rulepacks/nationalJurisdictionResolver.ts` · `server/jurisdiction/parcelZoningProxy.js` |
| Plus REPORT §H.3's 13 external rows (rule engines — Drools/SHACL/OpenFisca/BCRL all REJECTED; LoD2 reconstruction; XPlanGML stack; terrain compiler; pan-EU building master; CH evidence-chain rival; cadastre mirrors; …) | `audit/europe-site-intel/2026-08-31/REPORT.md` §H.3 |

### Lane C bottom line

The proposal's three named boxes are, respectively: a RENAME that would collapse a distinction
the freeze deliberately preserves (constraint graph), a shipped ~7,300-line corpus plus a name
collision (geometry kernel), and a twice-built artefact whose rivalry was already adjudicated in
C58's favour (legal envelope). The audit should return it for rewrite as TWO narrow evolution
seams — a true-3D solid stage with per-face rule attribution consuming C58 outputs, and a
reference-only evaluation cache keyed on `ruleSetVersion` — and reject every box that re-models
what `packages/schemas/src/siteintel/` froze on 2026-09-01. The hard-case table says the frozen
pipeline already handles more of the adversarial docket than the proposal assumes (datum, corner
lots, temporal/hierarchy, overlays, empty sets, consolidation); the genuine gaps are
neighbour-context solids, MIN-obligations (a new gate axis, not a schema abuse), and phased
development — all reachable additively, none requiring the proposal's redesign.
