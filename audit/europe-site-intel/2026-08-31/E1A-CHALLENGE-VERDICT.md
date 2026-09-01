# E1a CHALLENGE — §8 VERDICT (A–H)

> Synthesizer lane · 2026-09-01 · READ-ONLY (no code, schema or test changed).
> Authority: `E1A-CHALLENGE-BRIEF.md` §8. Inputs read IN FULL: the two challenge findings
> (`impl/e1a-challenge-mapping.md` 175 ln, `impl/e1a-challenge-architecture.md` 397 ln), the
> parallel gate supplement (`impl/e1a-gate-supplement.md` 369 ln), the ENTIRE subject
> (`packages/schemas/src/siteintel/` — entities.ts 556 ln, provenance.ts 155, confidence.ts 93,
> json.ts 35, index.ts 31, ruleformat.ts 199 [the STOPPED E1b draft, own header], vocabularies
> dk/nl/lt 67/82/70 — plus `packages/schemas/__tests__/siteintel.test.ts` 507 ln), and the
> load-bearing lane citations re-verified against `lanes/germany-denmark-switzerland.md`,
> `lanes/spain-france-portugal.md`, `lanes/netherlands-poland-lithuania-estonia.md`,
> REPORT §I/§J/§K, `E1B-GATE-BRIEF.md`, `DECISION-SUMMARY.md`, and the uncommitted E1d draft
> (`packages/site-parcel-data/src/countryAdapters/ee/eeRuleMapper.ts` — signal only, no authority).
> Every reviewer citation this verdict leans on was spot-checked against its primary source;
> none failed verification.

---

## A · ASSESSMENT: **REVISE BEFORE E1b**

The bar set by the orchestrator: REVISE requires *a demonstrated inexpressibility a first-five
country hits*; REDESIGN requires *a structural flaw extensions cannot reach*. The first-five, per
DECISION-SUMMARY row 6, are **EE → NL → LT → PL with DK corrections in parallel**.

**REDESIGN is ruled out.** Every probed construct in all eight systems maps (mapper §§1–8: no
row is a total BREAK of representability — the BREAKs are all *load-bearing-semantic-without-a-
typed-seat*, reachable by additive fields). The carrier-vs-ontology split, the
Source/Evidence/Document three-way split, the temporal spine, and the UNKNOWN ≠ 0 ≠ no-limit
machinery are sound, tested, and in two cases (EE korgus, CH ÖREB chain) proven against live
national data (architect §1.1, §4.1; mapper §11).

**APPROVE-AS-IS and APPROVE-WITH-FUTURE-EXTENSIONS are ruled out by four demonstrated,
first-five-country hits — three of them already committed in this tree (two in the model's OWN
test fixture, one in the first live adapter draft):**

1. **The DK denominator has NO typed seat and the wrong-number path is live** (DK — parallel
   track). `siteintel.test.ts:159` carries `bebygpctaf=4` in `confidence.note`; `confidence.ts:90`
   declares the note *"never load-bearing for logic"*; `provenance.ts:125` bars codelist values
   from `value`. A typed-fields-only consumer of the Aarhus row (`bebygpct=180, af=1`, lane 2
   §DK-2: *"a naive per-parcel 180% GFA would be WRONG"*) computes a wrong GFA while every field
   it read parsed clean — the exact C63 trap the entities.ts header invariant ("denominator is
   data, never assumed") exists to kill, violated by the model's own fixture.
2. **`geometryRef` dangles and the first live producer already emitted unresolvable strings**
   (EE — country #1; NL — country #2). `RuleApplicability.geometryRef` (entities.ts:308) and
   `Plan.geometryRef` (entities.ts:193) are bare `SiteIntelId`s with no referent among the 17
   entities. The stopped E1d draft minted `` `dp_hoonestus:${objectid}` `` (eeRuleMapper.ts:208)
   resolving to nothing, though the correct target (`SiteIntelPrescription kind:"buildingField"`)
   exists and the test's own §5 mini-graph builds one. NL `locatieRefs` (lane 4 NL-1a:45,
   identifiers like `nl.imow-gm1911.normwaarde.20240101`) hits the identical seam next.
3. **A legal date and an ingestion date are machine-indistinguishable** (EE — country #1).
   eeRuleMapper.ts:141 writes the FETCH date into `valid_from` with the apology *"never read this
   as the legal adoption date"* in the never-load-bearing note. `isInForceOn`
   (ruleformat.ts:181–199) cannot see the apology: point-in-time queries — DECISION row 8's
   funded feature — return confident false negatives on exactly the rows where the state served
   no validity axis (supplement §6 gap 1).
4. **The use-scope dimension is machine-invisible** (EE — country #1; DK anvgen/anvspec —
   parallel). eeRuleMapper.ts:326–352 encodes per-use-slot applicability as an id suffix
   (`-slot2`) plus free text — a real, probed, per-use conditionality no consumer can read
   (architect §3.5).

All four share one defect shape: **a load-bearing semantic routed through a channel the schema
itself declares non-load-bearing** (or through an unresolvable string). Each is additive-or-small
to fix NOW; each compounds into re-emission debt with every record E1b/E1d writes. That —
records emitted before the fix must be re-emitted after it — is what makes this REVISE rather
than APPROVE-WITH-EXTENSIONS. The revision set is deliberately minimal (§E, R1–R5): five typed
changes plus one contract sentence, then FREEZE.

### Reviewer disagreements, resolved (with the stronger evidence named)

- **Urgency of the denominator seat.** Mapper §13 defers it (*"awaiting the founder's §3
  Applicability decision rather than piecemeal patching"*); architect §5.3 marks it REVISE-class.
  **Resolved for the architect**: (a) the wrong-GFA consequence is quantified in lane 2 §DK-2;
  (b) the fix sits on `RuleProvenanceSchema`, orthogonal to the Applicability decision, so
  waiting buys nothing; (c) re-emission cost scales with every emitted record.
- **Remedy shape for the dangling referent.** Mapper G-1 proposes documentation + an E1b resolver
  contract (no schema change); architect §3.6 proposes typed `basis[]` `{kind, ref}` references.
  **Resolved for the architect's typed form**: the E1d draft proves a doc-only reference
  discipline was ALREADY violated by the repo's best-behaved adapter (supplement §9 clean bill +
  flag 2: *"the adapter quietly DEFINING the core's reference discipline by default"*) — an
  unenforced normative statement is this repo's documented rot mode. The `{kind, ref}` shape
  already exists in the model (`Evidence.from`), so it invents nothing. Both reviewers agree on
  the load-bearing point: **NO new entity** (§F).
- **"6/6 EXPRESSIBLE" (supplement §3) vs "4 EXPRESSIBLE · 7 CONTORTED · 1 BREAK" (mapper §9).**
  Not a conflict: the supplement graded the six brief-§3 rule EXAMPLES (can the value be
  carried), the mapper graded the twelve brief-§2 applicability SHAPES (is the carriage typed and
  traceable). Both files converge on the same sentence: expressibility is intact,
  **traceability of "why does this rule apply HERE" is not**.

---

## B · CURRENT STRENGTHS (freeze-worthy, all verified against code + lanes)

1. **JSON-Logic is a carrier, not the ontology — already, by construction.** `Rule.body` is
   `JsonValueSchema.nullable()`; nothing at schema level names JSON-Logic; canonical semantics
   live entirely in the typed envelope (architect §1.1). The only real use so far set
   `body: null` on every rule (eeRuleMapper). No demonstrated incompatibility from
   BCRL/SHACL/XPlanung/IMOW (architect §1.2 — the two structured-rule standards are
   attribute-shaped; the two rule languages were rejected on independent grounds, L1 §G.1/G.2).
2. **The per-rule provenance record round-trips all four probed provenance regimes verbatim** —
   EE attribute tier 1, DE PDF document/article/page tier 4, DK ramme, LT ASGR (test §§1–3), and
   the richest per-value provenance in Europe (LT `*_TP/_NR/_D/_TPR`) maps fully via
   adapter-minted Plan+Document (mapper §7).
3. **UNKNOWN ≠ 0 ≠ no-limit is structural, not conventional.** `value=null` parseable ONLY at
   tier 6 (provenance.ts superRefine, both directions tested); delta-null propagation on
   DevelopmentPotential; proven against the live EE `korgus="0"` sibling and the ES Aragón
   0-substitution shape. The model's best invariant (both reviewers, independently).
4. **The Source/Evidence/Document split is isomorphic to the best national evidence chain in
   Europe** — the CH ÖREB restriction → typeCode → lawStatus → versioned legal document chain
   (lane 2 §CH-1: *"MODEL its evidence chain on it"*), with FR's versioned `idurba` dropping
   verbatim into `Document.identity` + `version`.
5. **The temporal spine covers every state-served history mechanism probed** — DK
   `_med_historik`, PL `wersjaId`, LT `GALIOJA_NUO/IKI`, EE snapshots (REPORT §K.2) — via
   `valid_from/valid_to` + `Version` + `Scenario.asOfDate` + refuse-on-malformed `isInForceOn`;
   and `Version.entityRef` being untyped means ANY entity is versionable additively
   (supplement §6: DOES-NOT-PREVENT PASS).
6. **Native-CRS-on-the-coordinates kills the Madrid EPSG:4326 silent-zero trap by construction**
   (NativeCrsGeometrySchema; PL-2180/EE-3301/LT-3346 all honoured).
7. **Open-string doctrine holds in practice** — Plan.kind/status, zone typology,
   prescription/restriction kinds, id schemes absorb per-country and per-CA (ES 17-community)
   heterogeneity with zero schema churn; the three vocabularies are IMPORTED with cited probes,
   honest nulls (NL TypeNorm/Normgroep URIs), and a refused-by-name list
   (`impl/E1a-canonical-schemas.md`) proving the restraint was active.
8. **Non-rivalry discipline (C84 EI-9) held** — FetchOutcome, C58 refusals + BuildableEnvelope,
   LandBasis, C23 ExtractionProvenance, C62 all adopted, none re-minted; and the E1d draft
   confirms the adapter seam works (supplement §9: clean bill on all six forbidden items, grep
   evidence).
9. **Falsification is real**: corrupt-→-fail-naming-the-field executed with byte-identical
   restores (Control A/B), permanent in-test falsifications, P5 purity 0-impurity before/after,
   root tsc RC=0.

---

## C · ARCHITECTURAL GAPS — ranked by which European system hits them first
(sequencing: EE → NL → LT → PL, DK parallel, then DE/FR/CH document wave)

| # | Gap | First hit | Evidence | Class |
|---|---|---|---|---|
| 1 | **Dangling geometry referent** — `geometryRef` (Rule + Plan) resolves to nothing; no typed "because of this planning object" answer | **EE (already hit, in-tree)**; NL locatieRefs next; DK byggefelt/delområde | entities.ts:308/:193; eeRuleMapper.ts:208; L4 NL-1a:45; mapper G-1; architect §3.3 | REVISE (R1) |
| 2 | **Legal-vs-ingestion validity conflated** — `valid_from` carries two semantics split only by prose | **EE (already hit)** | eeRuleMapper.ts:141; confidence.ts:90; supplement §6.1; architect §4.3 | REVISE (R3) |
| 3 | **Use-scope has no leg** — per-use conditionality machine-invisible | **EE (already hit)**; DK anvgen/anvspec1..10; DE BauNVO per-Baugebiet later | eeRuleMapper.ts:326–352; L2 §DK-1; architect §3.5 | REVISE (R1 useScope) |
| 4 | **Note-overload / value-basis** — DK denominator code, EE EH2000 datum, LT unit caveat ride in a never-load-bearing field | **DK (in the model's own test)**; LT PILN :201; EE korgusabs | test:159; provenance.ts:125; L2 §DK-2 Aarhus af=1; architect §5.3; mapper G-2 | REVISE (R2) |
| 5 | **No precedence/instrument-rank seat** — ramme 150 vs lokalplan 630 indistinguishable; caps declarative-pack migration | **DK (parallel)**; FR overlay stacking later | L2:180 ladder verbatim; REPORT §J:465 (`precedence: ApplicabilityLadder` = adapter code); ruleformat.ts covers zone inheritance only; architect §3.4; mapper G-6 | REVISE (R1 rank) — resolution stays engine-side |
| 6 | **No normative-force axis** — a tier-1 indicative value is indistinguishable from a tier-1 cap; also the only honest encoding of brief-§5 example 5 | **LT (whole ASGR layer is "rekomendacinio pobūdžio", L4:332)**; DK `bygvejledende` L2:186; DE Orientierungswerte L2:64; CH has it on Restriction only (`lawStatus`) | mapper G-3; architect §5.2 | REVISE (R5) |
| 7 | **Evidence cannot cite a planning object** — geometric evidence (byggefelt polygon, Hauteur-plafond polygon, Baulinie) unnameable; hits chain #1 of E1c | any E1c chain (all 20 §R chains have geometric evidence) | EvidenceRefKindSchema = source\|document\|rule\|derivation (entities.ts:388); architect §4.2 | REVISE (R4, one enum) |
| 8 | **No rule grouping** — legal tuples (EE ehitusõigus, DK byggefelt attributes, bebygpct+af) shatter into unlinked rules | EE (hit); DK | mapper G-4; architect gap 4 | Largely closed by R1 `basis[]` (siblings sharing one basis ref reassemble the tuple) + R2 (the af companion); LATER if parity proves that insufficient |
| 9 | **Activity axis untyped** vs NL's native activity+location objects | NL (country #2) — severity NOT DECIDABLE until the keyed probe | mapper G-7; architect §1 NOT-DECIDABLE 1/3 | R1 `useScope` + condition carry it meanwhile; escalation gated on the DSO-key probe |
| 10 | **`Restriction.areaShare` unanchored** — "share of THE PARCEL" with no parcelRef | **CH (document wave, not first-five)** — BS `Geometry:[]` + PartInPercent, L2:270/280 | entities.ts:261–271; mapper G-5 ("sharpest single-field gap") | LATER (trigger: CH adapter) |
| 11 | **Prescription lacks the honesty machinery Rules have** — `value:null` ambiguous, no confidence object | **FR (document wave)** — "Hauteur plafond" typepsc 39-02 polygon, numeric empty at probe point, L3:201 | entities.ts:242; mapper G-8 | LATER (trigger: FR adapter) |
| 12 | **`unit:null` conflates dimensionless with unit-unknown** | LT MAX_INTENS (value served, unit unresolved 15/160) | mapper G-9; lt.ts header caution | Probe FIRST (ASGR methodology, week-1 register); R2 qualifier carries the caveat typed meanwhile; schema change only if the probe fails to settle |
| 13 | **Envelope-solid `maxHeightM:null` overloads** "no published limit" with "unknown" — L-616 one dereference away | PRYZM's own E1b engine, not a country | entities.ts:462–469; supplement §8.1 | E1b guard (superRefine or evaluator rule + 20-parcel rule 3) |
| 14 | **Baugrenze-vs-Baulinie semantics survive only in national typology codes** — one canonical `kind` token for two opposite semantics strains SOURCE-AGNOSTIC | DE/CH (document wave) | L2:138; mapper DE row + checklist #5 | LATER — mint canonical kind tokens (open list, no schema change) at DE-wave prep |
| 15 | **DevelopmentPotential has no time anchor** (no computedAt/envelopeRef) — the product number cannot be reproduced | PRYZM's own product layer | entities.ts:511–539; supplement §6.2 | E1b additive |
| 16 | Minor: Zone/Prescription/Restriction lack inline `version` | DK `_med_historik` re-cuts | mapper G-10 vs supplement §6 (Version rows attach externally — PASS) | NEVER-unless-navigability-demonstrated |

Cross-cutting watch item (architect §7 SEMANTIC): **`parameter` is an ungoverned open string** —
fixtures already spell one concept three ways (`maxHeight`/`maximum_height`/`bebygpct`). Not a
schema gap; an OWNERSHIP gap. The canonical parameter list must acquire an owner before
country #3 (§G item 7).

---

## D · EUROPEAN EDGE CASES EXPOSING THE GAPS — verbatim from the mapper

The mapper's spatial-checklist score: **"4 EXPRESSIBLE · 7 CONTORTED · 1 with a BREAK component
(and #9's precedence half inexpressible)"**. Its BREAK/CONTORTED rows, verbatim:

- DK `bebygpctaf=4`: *"**BREAK.** The codelist is imported (`vocabularies/dk.ts`) but the Rule
  has NO field to carry the code. The model's own test rides it in `confidence.note`
  (`siteintel.test.ts:159` `note: 'bebygpctaf=4 — read the denominator code!'`) — a field
  `confidence.ts:90` declares **'never load-bearing for logic'**. Yet 'denominator is data,
  never assumed' is entities.ts's OWN header invariant."*
- NL `locatieRefs`: *"**BREAK (G-1)**: `RuleApplicabilitySchema.geometryRef` (entities.ts:308)
  is an opaque `SiteIntelId` with no named referent type; no geometry-bearing entity exists for
  an arbitrary IMOW Locatie … The stopped E1d EE draft hit the identical wall and invented raw
  strings (`dp_hoonestus:<objectid>`…) — direct evidence the model chafes here in practice."*
- CH BS: *"**BREAK on anchoring: `areaShare` is 'affected share of THE PARCEL' (entities.ts:265)
  but `SiteIntelRestrictionSchema` has NO parcel reference field.** … once landed in the
  canonical store, '0.4 of which parcel?' is unanswerable."*
- DK precedence: *"**BREAK at the data layer, BY DESIGN**: REPORT §J assigns
  `precedence: ApplicabilityLadder` to adapter CODE. Consequence: the E1b declarative pack
  (`ruleformat.ts`) cannot carry the ladder."*
- DK `bygvejledende` / DE Orientierungswerte / LT ASGR advisory status: *"**BREAK** …: no
  normative-force axis on Prescription or Rule (see G-3) … A tier-1-authoritative value that is
  legally NON-BINDING is indistinguishable from a cap; the six confidence tiers measure
  sourcing, not normative force."*
- LT `PILN`: *"**BREAK (G-2 note-overload)**: 'authoritative but possibly incomplete
  consolidation' is neither a tier (sourcing is tier 1) nor representable in a non-load-bearing
  note."*
- EE ehitusõigus tuple: *"**CONTORTED (G-4)**: the legal unit is the tuple; the model stores
  5–14 sibling rules with no grouping. 'Show me this plot's ehitusõigus' = reassembly by
  convention."*
- FR "Hauteur plafond": *"**CONTORTED**: `Prescription.value=null` … is ambiguous between 'this
  kind has no scalar payload' and 'the scalar exists but is unknown/pending' — and Prescription
  carries NO confidence object … The value-pending fact currently has nowhere honest to live."*
- Checklist #8, a particular geometry: *"**CONTORTED, borderline INEXPRESSIBLE as typed data** —
  `geometryRef` names NOTHING resolvable."*
- Checklist #9, overlays: *"**EXPRESSIBLE** (the overlay itself) / **INEXPRESSIBLE** (its
  precedence)."*
- DE BauGrenze/BauLinie: *"the canonical kind vocabulary has one token (`buildingLine`) for two
  opposite semantics. An envelope engine must branch on NATIONAL codes — which breaks the
  SOURCE-AGNOSTIC principle (§7) at the semantic layer."*
- DK delområde: *"stuffing `delnr` into `typology.national` abuses a field defined as 'National
  code, verbatim'. Workable, untyped."*
- EE `dp_krunt` planned plots: *"the planned-plot concept has no honest entity; today it must
  masquerade as Zone/Prescription. Same missing-referent family as G-1."*
- PGM Art. 242.4 (ES): *"geometric predicates need pre-computed facts in the E1b fact
  vocabulary, or they are inexpressible"* — the §1 JSON-Logic limit, correctly E1b-scoped.

NOT DECIDABLE FROM EVIDENCE (mapper §12 + architect, consolidated — probes named, no country
detail invented): DE `hoehenangabe` internal structure (probe: XPlanGML XSD / xleitstelle
fixtures) · FR Hauteur-plafond numeric carriage (probe: prescription-surf sweep ≥3 PLUs) ·
NL IMOW Activiteit data shape + locatieRefs referent severity (probe: keyed `_zoek`/
regeltekstannotaties after the free DSO key) · NL STTR/DMN round-trip (probe: one
toepasbare-regels tree) · DK delområde/byggefelt full schemas (probe: full DescribeFeatureType) ·
LT MAX_INTENS unit (probe: ASGR methodology document) · ES Madrid restriction layers ·
frontage-as-served-object (no lane probed one).

---

## E · PROPOSED CONCEPTUAL EXTENSIONS (smallest-necessary; NO implementation until the founder
approves this set — brief §3 clause honoured)

### The REVISE batch — land as ONE schema change-set, then freeze (all NOW)

- **R1 · Typed Applicability value object on Rule** (architect §3.6, adopted; answers brief §3
  YES — *as a value object, NOT a new independently-identified entity*, since no audited country
  serves applicability as an addressable object). Replaces the three untyped legs
  (entities.ts:306–315) with:
  `basis[]` — typed refs `{ kind: zone | prescription | plan | restriction | regulation | parcel,
  ref }` (the `Evidence.from` shape; `parcel` added by this synthesis to close mapper checklist
  #1's missing entire-parcel leg) · `geometry` — inline `NativeCrsGeometry` for the residual
  bare-geometry case · `useScope[]` — verbatim national use tokens, never harmonised at L0 ·
  `rank` — nullable `{ scheme, level }` mirroring the national instrument ladder (DK:
  byggefelt/delområde/lokalplan/ramme/BR18); RESOLUTION stays in the engine ·
  `condition` — the predicate, unchanged. Temporal legs stay where they are (proven; moving them
  is churn). At least one leg required, as today.
  Closes gaps #1, #3, #5, and most of #8/#9. **Companion contract sentence (non-schema):** every
  `basis`/`geometry` reference MUST resolve to a minted entity — an adapter that cites a
  hoonestusala mints the Prescription it cites (the E1d rework, §G).
- **R2 · Optional typed value-basis qualifier on `RuleProvenanceSchema`** — one `{scheme, code}`
  object (e.g. `{scheme:'dk-bygberegnaf', code:'4'}`, `{scheme:'ee-vertical-datum',
  code:'EH2000'}`, an LT unit-caveat scheme), mapped to `LandBasis`/datum semantics in ADAPTERS
  only — **no mapping table at L0** (L-664, as `vocabularies/dk.ts` already honours). Closes
  gap #4; carries gap #12's caveat typed until the probe settles it.
- **R3 · `validityBasis: 'legal' | 'ingestion'`** beside `valid_from`/`valid_to` on
  `RuleProvenanceSchema`. Closes gap #2; makes REPORT §K.2's ingestion-versioning sanction
  machine-visible.
- **R4 · Extend `EvidenceRefKindSchema`** with the geometric planning entities
  (`zone | prescription | restriction | plan | parcel`). One enum, no new fields. Closes gap #7.
- **R5 · Nullable open-string normative-force field on the rule record** (mirrored, never
  harmonised — the same doctrine as `Restriction.lawStatus` and `Plan.status`). Closes gap #6;
  gives brief-§5 worked example 5 (authoritative-but-ambiguous) its honest encoding without
  touching the six tiers.

Also NOW, non-schema: **document the tier enum as a PROJECTION** of the real axes (derivation ×
valueLocation × source-kind × validation-event × known-unknown) and refine-reject incoherent
pairs (e.g. tier 1 + AI_EXTRACTED) — architect §5.1.2. No seventh tier, no score.

### LATER — additive, each with its named trigger

- `Restriction.parcelRef` (nullable, required-when-areaShare) — trigger: the CH adapter lane
  (first-five never emits areaShare-only restrictions).
- Optional `confidence` on Prescription + a typed value-pending distinction — trigger: the FR
  adapter emitting prescription-surf rows with pending numerics.
- Body dialect/carrier tag on `Rule.body` — trigger: the first geometric construction migrating
  in the Barcelona TS→data pilot (architect §1.3). Until then JSON-Logic-over-named-facts is the
  documented convention.
- Canonical Prescription `kind` tokens for boundary-vs-mandatory-alignment, sub-area, planned
  plot (doc-only; the list is open) — trigger: DE-wave prep / first DK delområde emission.
- Explicit rule-group/companion link — trigger: only if E1b golden parity demonstrates
  reassembly-via-shared-`basis` is insufficient for ehitusõigus/byggefelt tuples.
- `PlanningObject`/`Locatie` entity — trigger: a real IMOW Locatie that fits none of the four
  geometry-bearing entities, established by the keyed NL probe (mapper G-1's own escalation
  clause).
- Unit-unknown distinction on `unit` — trigger: the ASGR methodology probe FAILING to resolve
  MAX_INTENS.
- Text spans with offsets, table/row locators, per-request Evidence URLs, intra-day timestamps —
  triggers as named in architect §4.4 (extraction pipeline for DE/CH/FR; Barcelona pilot; a
  dispute hash+date cannot settle; an intra-day re-fetching adapter).
- Envelope-solid guard (tier-6 ⇒ no null-capped solids) + `DevelopmentPotential.computedAt/
  envelopeRef` — land with E1b's evaluator/envelope work (supplement §8.1/§6.2); additive, no
  adapter re-emission at stake.
- Source-registry columns `theme/coverage/updateFrequency/adapterStatus` (4 nullable) + seeded
  country data modules — E1b-scope NOW-thin per supplement §7.

---

## F · WHAT SHOULD **NOT** BE ADDED (each with its reason)

1. **No Applicability ENTITY with its own id/lifecycle** — no audited country serves
   applicability as an addressable object; CH computes the join server-side, everyone else
   serves geometry to intersect (architect §3.6). Value object only.
2. **No `PlanningObject`/`Locatie` entity now** — the four geometry-bearing entities + the R1
   referent contract cover every probed case (hoonestusala, krunt, delområde, byggefelt via
   Prescription/Zone); minting it before the keyed NL probe is a premature entity (mapper G-1).
3. **No merging of Prescription and Restriction** — the CH building-line seam (one concept, two
   register origins) is a documented CONTORTION, but the origin split is load-bearing; queries
   span both (mapper CH row, restraint clause honoured).
4. **No folding normative force, completeness (PILN), or ambiguity into the confidence tiers** —
   the brief's §5 no-dimension-collapse clause; sourcing and legal force are orthogonal axes
   (mapper G-3; architect §5.2).
5. **No seventh tier and no single numeric confidence score** — the tier survives as a
   documented projection; a score is the collapse the brief forbids (architect §5.1.2).
6. **No `exceptedBy[]`/`displaces[]` rule-to-rule links** — no lane demonstrated any country
   SERVING machine-linked exceptions; RASE `exception` verbatim text carries them honestly
   (architect §3.6 deferred-by-name).
7. **No precedence RESOLUTION algorithm in the data model** — rank is a fact about the rule
   (R1); the resolver is engine/adapter work, exactly how the existing attribution layer treats
   priority as data (architect §3.4; REPORT §J).
8. **No DK-code→LandBasis mapping table at L0** — L-664; adapter semantics (dk.ts header).
9. **No closed enums for Plan.kind/status, zone typologies, Prescription/Restriction
   kinds/themes** — "a closed enum here would be an invented harmonisation of 30 national
   lifecycles" (entities.ts, proven by ES 17-CA heterogeneity landing without churn).
10. **No invented IMOW list members or guessed URIs; no LT MAX_INTENS unit** until fetched/
    resolved — the vocabularies' own refusal discipline (nl.ts/lt.ts headers).
11. **No JSON-Logic as canonical ontology; no rule-expression ontology at L0** — the envelope/
    body split is the implemented design and no probed construct requires more (architect §1);
    geometric operators become NAMED ENGINE FACTS, not schema.
12. **No history tables / bitemporal machinery beyond `Version`** — supplement §6:
    DOES-NOT-PREVENT PASS; nothing is unversionable additively.
13. **No inline `version` on Zone/Prescription/Restriction** unless navigability is demonstrated
    — external Version rows suffice (supplement §6 vs mapper G-10, resolved for the supplement).
14. **No geometry math, CRS database, or street-width field at L0** — I/O purity (P5) and the
    street-width-is-a-construction doctrine (entities.ts Road header).
15. **No OME2 15-country registry seed before its licence text is fetched** — seeding unprobed
    rows would mint the unverified-claims table `probes[]` exists to prevent (supplement §7;
    DECISION row 10b).
16. **No new evidence system** — E1c wires chains through the EXISTING attribution layer
    (E1B-GATE-BRIEF §4; entities.ts Evidence doc).

---

## G · RECOMMENDED E1b SCOPE (what E1bc builds against — and the fate of the stopped work)

**Step 0 — the revision batch (R1–R5) lands FIRST, as one change-set with test extensions, then
§H's freeze takes effect.** Nothing in E1b/E1d emits canonical records before it: every record
emitted earlier must be re-emitted (the REVISE rationale).

1. **The stopped E1b draft (`ruleformat.ts`) SURVIVES as the schema seat** — its composition
   discipline (E1a envelope composed whole, never re-declared; RASE verbatim spans;
   confirmed-absence-as-absence-from-rules) is correct and none of the revision items break it
   (`DeclarativeRuleSchema` extends `SiteIntelRuleSchema`, so R1/R2/R3/R5 flow through). Two
   adjustments: (a) it remains EXPERIMENTAL, not frozen — note it is ALREADY exported from the
   package barrel (`siteintel/index.ts` exports `ruleformat.js`), so mark it draft in-code until
   E1b ratifies it at golden parity; (b) the pack document gains nothing for layer precedence
   from `inheritsFromZoneCode` — the DK ladder rides R1 `rank`, resolution in the evaluator.
2. **The stopped E1d EE adapter draft SURVIVES** — the supplement's §9 audit gives it a clean
   bill on all six forbidden items and calls it the exemplar of the boundary discipline. Five
   named reworks before it emits: mint the Prescription each rule's basis cites (R1 contract);
   `validityBasis:'ingestion'` instead of the note apology (R3); per-use-slot encoding →
   `useScope` (R1); replace `ringCentroid` with a point-on-surface util in core geometry or
   bbox-query the plan layers (supplement §9 flag 1 — wrong-result risk on concave parcels);
   reconcile the `fetchChain` signature with the E1b SDK type (supplement §9 flag 3).
3. **E1bc proper**: the typed deterministic evaluator at L2 (`@pryzm/site-parcel-data`
   rulepacks/declarative) over scalar rules + `isInForceOn`; **the FACT VOCABULARY for predicates
   and constructions is part of the E1b freeze list** (supplement §3.4 — or two packs spell one
   fact two ways); precedence resolution engine-side reading R1 `rank`; the envelope-solid
   tier-6 guard (supplement §8.1) as an evaluator rule minimum; `DevelopmentPotential`
   `computedAt`+`envelopeRef` additive fix. Body dialect tag only when the Barcelona pilot
   migrates the first geometric construction (PGM Art. 242.4 class).
4. **Pilot = Barcelona pack es-08019 golden parity** (DECISION row 5): TS pack stays live until
   the data pack matches 100%; the migrated rules must carry R1/R2/R5 from day one.
5. **Source Registry NOW-thin** (supplement §7): add the 4 nullable columns to
   `SiteIntelSourceSchema`, one data module per audited country seeded from `EE_SOURCES` + the
   four rotting prose forms, build-time validation. No fetching, no UI, no OME2 rows.
6. **Week-1 probe register** (all block later decisions, none block Step 0): request the free NL
   DSO key + pull ONE STTR tree and the locatieRefs referent shape (settles gap #9 and the
   Locatie escalation) · LT ASGR methodology for MAX_INTENS (settles gap #12) · DE XSD deferred
   to the DE wave.
7. **Country order stands: EE → NL → LT → PL, DK corrections in parallel** (DECISION row 6) —
   note the revision batch was ranked BY this order (§C), so it de-risks exactly the countries
   E1b touches first. **Parameter-vocabulary ownership must exist before country #3** (architect
   §7 watch item).
8. **Acceptance = the 20-parcel baseline** (supplement §10) with its four test-wide rules —
   grades read off typed artefacts, tier-6 visibility mandatory, `isUpperBound` explicit,
   shrink-only in the MISSING/AI direction.

---

## H · FREEZE LIST

### FROZEN — stable contracts (change henceforth requires a superseding ADR)

- **The six-tier confidence enum + numeric coding + both mappings** (confidence.ts) — verbatim
  from BRIEF §3, survives the challenge intact; documented henceforth as a projection of the
  underlying axes (§E), which changes its documentation, not its shape.
- **The UNKNOWN ≠ 0 ≠ no-limit machinery**: `value=null ⇔ tier 6` superRefine; delta-null
  propagation; Terrain/Restriction at-least-one-leg refines; `isUpperBound` required-no-default.
- **`RuleSourceRefSchema`** — the eight-field legal address, canonical `plan_id`/`object_id`
  spelling + alias preprocess, nullable-means-this-hop-does-not-exist.
- **`RuleDerivationSchema`** (DIRECT/DERIVED/AI_EXTRACTED/HUMAN_VALIDATED) and
  **`RuleValueLocationSchema`** (attribute/in-document-text) — imported splits, probed against
  NL/EE.
- **`NativeCrsGeometrySchema`** — CRS travels with the coordinates, always.
- **The temporal spine**: `valid_from`/`valid_to` semantics (inclusive, lexicographic ISO,
  null-valid_to = in force), `SiteIntelVersion`, `Scenario.asOfDate`, `isInForceOn`
  refuse-on-malformed. (R3 ADDS a field beside them; it changes no frozen semantics.)
- **The 17-entity roster and the `SiteIntel` name-prefix/id discipline**, and the
  **non-rivalry register** (FetchOutcome, C58 envelope + refusals, LandBasis, C23, C62 —
  adopted, never re-minted; conflicts resolve in the incumbent's favour).
- **The open-string doctrine** for Plan.kind/status, zone typology
  (national-verbatim + harmonised-null-unless-exists), Prescription/Restriction kinds/themes,
  id schemes.
- **The imported vocabularies as shipped**: the closed DK bygberegnaf 4-code list
  (fifth value = parse failure), the NL three-way split + `nlNormwaardeValueLocation`, the LT
  field/suffix vocabulary with its refused unit.
- **`JsonValueSchema` and the carrier doctrine**: `Rule.body` is an execution carrier; canonical
  semantics live in typed envelope fields; JSON-Logic is never the ontology.

### REVISED-THEN-FROZEN (the R-batch, frozen the day it lands)

- `RuleApplicability` → the R1 typed value object (basis[]/geometry/useScope/rank/condition).
- `RuleProvenanceSchema` + R2 value-basis qualifier + R3 validityBasis + R5 normative-force.
- `EvidenceRefKindSchema` + R4 planning-object kinds.

### EXPERIMENTAL — explicitly NOT frozen

- **`ruleformat.ts` in its entirety** (DeclarativeRule/Zone/PackMeta/PackDocument, RASE) — the
  stopped E1b draft, ratified only at Barcelona golden parity; currently exported from the
  barrel and should be marked draft in-code until then.
- **`KNOWN_PRESCRIPTION_KINDS` contents** — open list, will grow (boundary-vs-alignment,
  sub-area, planned-plot tokens; §E LATER).
- **The `parameter` vocabulary** — ungoverned open string; needs an owner before country #3.
- **`SiteIntelTerrainSchema.datum`** — only ELLIPSOIDAL minted; the EE EH2000 normative-datum
  question rides R2 meanwhile.
- **`Prescription.value` semantics** — pending the FR-triggered honesty extension.
- **The Envelope catalogue form's solid details** — pending the E1b tier-6/maxHeightM guard;
  C58 remains the scene-space authority regardless.
- **`SiteIntelSourceSchema` registry columns** — the 4 additions land in E1b scope.
- **NL TypeNorm/Normgroep URIs** — honest nulls until fetched live.

---

*Every claim above binds to a file:line, a lane section, or a test line; the three reviewer
disagreements are resolved in §A with the deciding evidence named; nothing was added beyond the
smallest set the demonstrated first-five hits require.*
