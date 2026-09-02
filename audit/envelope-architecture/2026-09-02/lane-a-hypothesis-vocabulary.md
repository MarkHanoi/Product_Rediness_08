# LANE A — ADVERSARIAL AUDIT: the core hypothesis + the proposed constraint vocabulary

**Auditor:** independent principal-architect lane (read-only). **Date:** 2026-09-02.
**Evidence base:** the repo's own measured corpus — every counter-example below is a REAL rule
PRYZM has already met, cited by file path. Foreground reads only; no repo file modified.

---

## 1 · VERDICT

**The hypothesis survives in a WEAK form and fails in the STRONG form in which it is stated.
The proposed vocabulary is one of three layers the corpus demands, and it is the layer where
the least of the difficulty lives.**

### 1.1 What survives (and the repo proves it)

The kernel-convergence half is true: every rule this repo has met, across ES/FR/PT/DE/DK/EE/CH/
NL/LU, ultimately *renders* as polygon rings + extrusions + clip planes + boolean ops + refusals.
`packages/site-parcel-data/src/rulepacks/frParisPluBioclimatique.ts` (`computeParisEnvelope`:
footprint = polygon, height = min of candidates, volume = extrude − subtract),
`packages/site-parcel-data/src/sevillaFondoClip.ts`, `envelopeToMassing.ts` — one
jurisdiction-agnostic engine (`ZoningRulesEngine.ts`, C58 §1.5: "it must carry no DK-specific
branch") does in fact determine for every jurisdiction that produces numbers. The
adapter-interprets / canonical-model-represents / engine-determines PATTERN is not a proposal —
it is the shipped architecture (`countryAdapters/{dk,ee,fr,pt,fi,lt,lu,no,pl,se}`, the E1a
canonical schemas in `packages/schemas/src/siteintel/`, the E1bc declarative evaluator at
Barcelona byte-parity — `audit/europe-site-intel/2026-08-31/impl/E1a-canonical-schemas.md`).

### 1.2 What fails

**The proposed vocabulary conflates three different layers into one flat list, and omits the
five semantic dimensions that the repo's history shows are the actual work.**

- SPATIAL (INSIDE, OUTSIDE, INTERSECTS, TOUCHES…) are DE-9IM **compliance-check predicates** —
  they test a candidate design; they do not *construct* an envelope.
- PLANAR + BOOLEAN (VERTICAL_PLANE … INTERSECT/UNION/SUBTRACT/CLIP) are **kernel operations** —
  genuinely universal, and the only part of the proposal that is fully defensible as-is.
- VERTICAL + SURFACE/VOLUME (MAX_HEIGHT, MAX_GFA…) are **parameters**, and as proposed every one
  of them is underspecified in a way the corpus has already punished (see §4).

What is missing entirely — measured against rules PRYZM has already shipped or refused:

1. **The CONSTRUCTION layer.** The most valuable European rules do not *state* a number; they
   state an **algorithm over facts** — street-width band tables, block-derived implicit solves,
   parcel-area-indexed FARs, fabric statistics, height-proportional setbacks. The repo needed
   SIX discriminated geometric-rule kinds for Spain alone
   (`packages/schemas/src/site/GeometricRule.ts`: `setback`, `alignment`,
   `block-derived-alignment`, `tiered-occupation`, `occupation-capped-alignment`,
   `explicit-area`), each minted only after a real ordinance refused to fit the previous kinds
   (ADR-0270/0271/0272/0273/0288, each rejection argued in the schema's own doc comments). The
   proposed vocabulary has zero constructions.
2. **DATUM semantics** on everything vertical (§4.1).
3. **BASIS/DENOMINATOR semantics** on everything ratio-shaped (§4.3) — the single largest
   *measured* correctness incident in the corpus (DK, §2 rank 2).
4. **PRECEDENCE / instrument-ladder / combination semantics** — which of several co-applicable
   rules binds (DK `dk-plan-ladder`, Paris min-of-candidates, B-Plan overrides Land statute).
5. **APPLICABILITY + HONESTY semantics** — conditions over a declared fact vocabulary; legal
   regime gates that answer with *cited refusals*; UNKNOWN ≠ 0 ≠ no-limit as a structural rule;
   never-overstate direction-of-error. In this codebase these are enforced at the frozen L0
   schema (`packages/schemas/src/siteintel/provenance.ts` superRefine: `value=null` only at
   tier 6) and by gate (`tools/ga-gate/check-envelope-never-overstates.ts`, 181 zone-solves,
   0 overstatements). A vocabulary with no representation for "we refuse, and here is the
   citation" cannot host the corpus at all: for Paris, Zürich, Madrid NZ1 (pre-sign), Porto and
   clau 18, **the shipped product IS the refusal object**, not a geometry.

And one clause of the hypothesis must be weakened on the repo's own evidence: **"ONE universal
geometric engine DETERMINES" is false as stated.** The honest output set the corpus forces is
*determine* | *determine-partially per component* | *draw-a-labelled-engineering-choice* |
*refuse with citation*:

- Córdoba PGOU 2001 Art. 13.5.2.4 (`GeometricRule.ts`, `occupation-capped-alignment` header):
  an occupation cap with **no siting rule does not determine a unique polygon** — infinitely
  many shapes satisfy it. The engine's ring is, in the schema's own words, *"PRYZM's modelling
  choice, not the ordinance's stated shape"*, and every consumer must cite it as such.
- Paris cour=X: footprint + straight extrusion determined, couronnement **refused per-component**
  (`ParisEnvelopeComponents`, `parisCouronnementRefusal`, art. UG.3.2.4).

### 1.3 The adversarial meta-finding: the hypothesis fights the wrong war

The E5/E8 measurements say the binding constraint on European coverage is **sourcing and
extraction, not geometric representability**:
`impl/e5-devpotential-categories.md` — envelope state-served **NOWHERE (21/21)**; rules
completeness fails on **three independent axes, every country a different one** (LU 93.7–97.8%
typed numerics vs SI ~1% with sentinel zeros); `impl/e8-extraction-scout.md` §3.1 — DE/NRW is
**OCR over scanned drawings for ~87% of plans**. The Paris crown taper is *representable* by the
proposed INCLINED_PLANE today — and is still refused, because the geometry is PDF-bound. Memory
`envelope-replication-standard.md` records the same for Barcelona: *"cost = rule-pack
SOURCING."* A vocabulary redesign spends effort where the corpus shows the least of the cost is.

Also a governance hazard: the repo already holds **two frozen vocabulary seats** — the E1bc
`DECLARATIVE_FACTS`/`DECLARATIVE_PARAMETERS` (frozen 2026-09-01 at golden parity, append-only;
`rulepacks/declarative/factVocabulary.ts`) and the E1a canonical parameter vocabulary + national
vocabularies (`packages/schemas/src/siteintel/`, `vocabularies/{dk,nl,lt}.ts`). A third,
greenfield vocabulary is a C84 EI-9 rival by construction. **Any adoption of this proposal must
be positioned as an append-only extension of those seats, not a replacement.**

---

## 2 · THE STRONGEST COUNTER-EXAMPLES, RANKED

Ranked by (a) how completely the proposed vocabulary fails, times (b) how much land the rule
governs, times (c) whether the repo has already *measured* the failure mode.

**#1 — Porto *moda da cércea* (PT).** Height = the cércea "with the greatest extent along the
built urban frontage" — the **statistical mode of the existing context fabric** over a defined
set (*frente urbana* = façades between two successive intersecting public ways, Art. 3.º l/o).
`countryAdapters/pt/ptPortoPdmDraft.ts` gate blocker 4 records, in terms: *"a FABRIC-DERIVED
value no C58 GeometricRule kind can represent today"* (`fabricDerivedHeight`, named in
`pt-13/1315-porto/ENVELOPE.md`). MAX_HEIGHT-as-scalar cannot say it; no proposed primitive
aggregates over a context set. Same family: Paris `plub_filet` code M → "same as existing
façade" (`frParisPluBioclimatique.ts`). This is the dominant height regime of a whole city, and
it is not exotic — it is the "cornice-line of the block" pattern across old-fabric Europe.

**#2 — Danish *bebyggelsesprocent* denominator (DK).** MAX_GFA/FAR without a **value basis** is
not merely incomplete — it produced the corpus's largest measured wrong-number incident:
`impl/lane-dk-corrections.md` §0 — the shipped path computed a per-parcel FAR from a percentage
whose denominator is not the parcel for **72–85% of populated Danish plans** (codes 1 "the plan
area as a whole" / 2 "the ejendom"), measured nationally 2026-09-01 across 154,872 features. The
fix is a codelist-typed `valueBasis` on the rule (`countryAdapters/dk/dkRuleMapper.ts`,
`dk-bygberegnaf`; L0 `vocabularies/dk.ts`) plus refusal at non-parcel scope
(`rulepacks/dkPlandataEnvelope.ts`, L-449). The proposed MAX_GFA / MAX_COVERAGE /
MIN_OPEN_SPACE carry no basis slot at all — the identical latent bug, re-installed by design.

**#3 — German *Abstandsflächen* 0.4×H (DE).** Setback depth = a **function of the proposed
building's own height** (BauO NRW 2018 §6: 0.4·H, min 3 m; 0.2·H GE/GI; 0.25·H MK —
`docs/04-reference/jurisdictions/de/de-nw/05315-koeln/NRW-SETBACK-ENGINE.md`: *"there is no
single number to source per zone; there is a formula to code once"*). DISTANCE_FROM/OFFSET_FROM
are constants; a circular constraint turns determination into a parametric/fixed-point solve.
It CAN be compiled to an inclined constraint plane (slope 1/0.4 from the boundary) — but only
via the Land-specific H-measurement semantics (§6 reference points, gable/roof contributions —
explicitly PENDING a primary-text read), and it is overridden wherever a B-Plan draws
Baugrenzen/Baulinien (precedence, gap #4/#8). Same shape: Porto *afastamento* ≥ H/2, min 3 m
(`ptPortoPdmDraft.ts`).

**#4 — Barcelona block-derived depth + tiered occupation (ES).** PGM Art. 242.2: depth is the
solution of an **implicit area equation on the BLOCK** ("equidistant figure leaving ≥30% of the
block free", clamp 11/30 m) — `BlockDerivedAlignmentRuleSchema`. PGM Art. 350.2 (clau 22a): a
band whose area **EQUALS** 70% of the block, two height tiers tiling one parcel, interior tier
5 m measured *"des de la rasant del carrer"* — `TieredOccupationRuleSchema`, whose doc comment
carries the killer distinction: **minimum vs equality quantifier** ("same digits, different
quantifier, different solver contract" — a minimum needs ordinance clamps; an equality picks
itself and MUST NOT be clamped). The proposed vocabulary has no implicit-solve construction, no
quantifier distinction, and no way to state the static input requirement (`requiresBlockRing` —
unsolvable without a block ring must be a loud boundary failure, not a runtime undefined). And
L-581 (`docs/04-reference/ISSUE-LOG.md` row 745) is the measured warning about the KERNEL
beneath it: mixed party-wall/front insets collapsed on **~61.5% of real Eixample blocks** and
the solver read the geometry failure as a legal statement — the kernel's failure taxonomy is
itself load-bearing.

**#5 — The MAX_HEIGHT datum family (everywhere).** See §4.1. L-584: heights measured from the
*rasant* at the FAÇADE, with explicit sloping-frontage segmentation machinery — the flat-plane
extrusion is *"wrong by the street's fall across the parcel — metres in the Gòtic"*, and it is
a legal defect already being published. Paris HMC is an **NGF absolute altitude**, honestly NOT
applied as a cap because converting it needs the façade rasant (`computeParisEnvelope` caveat).
Estonia serves BOTH `korgus` (relative) and `korgusabs` (absolute, EH2000) as distinct
parameters (`countryAdapters/ee/eeRuleMapper.ts`). One token MAX_HEIGHT flattens four different
legal quantities.

**#6 — Explicit-geometry zones (ES/FR).** Madrid NZ1 (`rulepacks/esMadridNZ1.ts`): the ordinance
**publishes the buildable footprint AS geometry** (Fondo de la Edificación polyline + COEF_Z per
manzana); Barcelona clau 18 = 22.5% of the city's private buildable land, vectorised as
`OV_Trames` (`esBarcelonaVolumetria18.ts`); Paris ECM polygon (`frParisPluBioclimatique.ts`).
Repo doctrine, stated at `ExplicitAreaRuleSchema`: transcribing a published polygon into
parameters *"is a lossy re-derivation of something already authoritative."* The vocabulary has
no geometry-reference primitive — it can only re-derive, which is here the WRONG operation.

**#7 — Banded street-width constructions with refusal tolerance (ES/PT).** Art. 327.2 alçada
table keyed on the *amplada de vial* (`rulepacks/bcnAlcadaReguladora.ts`): the legal input is
the **officially-declared** width (which no probed Spanish city serves machine-readably), the
band edges are steps where **1 cm of measurement noise moves the answer a full storey**
(20.00 m ⇒ PB+5 22.40 m vs 19.99 m ⇒ PB+4), so the module *refuses near a band edge*; the width
itself resolves through a four-tier ladder with measured per-city quanta
(`rulepacks/ampladaDeVial.ts` — Barcelona {20,30}, Madrid {15,30}, Córdoba/Sevilla `quanta: []`).
Porto: cércea ≤ largura do arruamento, 21 m cap, moda override (`ptPortoPdmDraft.ts`). A
BANDED_LOOKUP without tolerance/refusal semantics converts measurement noise into storeys.

**#8 — Build-to LINE vs build-limit (DE/ES).** *Baulinie* = the façade MUST SIT ON the line (an
equality); *Baugrenze* = may not cross (an inequality) —
`de/de-be/11000-berlin/EXTRACTION-PIPELINE.md` §mapping; Spanish *alineació a vial* (PGM
Art. 349, `GeometricRule.ts` `alignTo: 'street'|'official-line'` + `alignmentOffset_m`). The
proposed spatial predicates are all inequality-flavoured (INSIDE, DISTANCE_FROM ≥ …); none can
state a mandatory alignment. Getting this wrong flips ensanche fabric from "façade on the
street" to "anywhere behind a limit" — a different city.

**#9 — Terrain-conditioned parameters (ES).** PGM Art. 255: edificabilitat **reduced −20% at
30–50% slope, −40% at 50–100%, INEDIFICABLE above 100%** (`rulepacks/esBarcelona20aAillada.ts`
header — flagged as "THE LARGEST KNOWN OVER-STATEMENT RISK IN THIS PACK"). HEIGHT_FIELD is a
kernel surface; what is missing is slope-as-declared-fact conditioning a SURFACE parameter.

**#10 — Projection allowances BEYOND the envelope (ES).** *Cossos sortints* / tribunes
(`rulepacks/esBarcelonaCossosSortints.ts`, PGM Arts. 223.2.g/229/230): habitable volume that is
**defined as exceeding the alignment** — vol ≤ 1/10 amplada de vial capped 1.50 m, from first
floor up, ≤ 1/3 of façade length, ≥1 m from the mitgera. Repo classification:
`NOT-THE-RULE-KIND` — a **morphology allowance over a resolved envelope**, evaluable only after
an envelope exists (opposite dependency order). The vocabulary has no post-envelope layer;
folding these into the envelope would OVER-state (the one forbidden direction).

**#11 — Non-geometric applicability and case law (DE/ES).** Berlin: BauGB **§34/§35 regimes
produce NO numbers — the correct product output is a cited refusal**
(`de/de-be/11000-berlin/BERLIN-RULEPACK.design.ts` regime classifier;
`e8-extraction-scout.md` §1.1 regime gate); Baunutzungsplan 1958/60 carries judicial
*funktionslos* risk (confidence cap, never `verified`). Madrid NZ1 heights are per-ficha case
law (memory: CPPHAN-discretionary); Barcelona Arts. 342.1/343.1 exceptions trigger on **pre-1956
deeds and the 1953 Pla Comarcal** — cadastral legal history PRYZM does not hold, surfaced as
MAY-APPLY caveats, never applied (`esBarcelona20aAillada.ts`). El Sauzal's typology assignment
lives in a *fichero anexo* absent from the extractable PDF (`rulepacks/esElSauzal.ts`,
`EL_SAUZAL_FICHERO_ANEXO_GAP`). No geometric vocabulary of any richness represents these; the
architecture must represent **the refusal**.

---

## 3 · MISSING-PRIMITIVE TABLE

Discipline applied: every row carries a real citation from the corpus; rows that "sound useful"
but have no PRYZM-met rule behind them were dropped (none of the proposed 24 tokens is extended
speculatively). Layers: **semantic** (canonical model / schema attribute) · **constraint**
(declarative rule kind / construction) · **kernel** (geometry engine) · **adapter** (national
mapping data).

| # | Real regulation (country) | Why the proposed vocabulary fails | Proposed primitive | Layer |
|---|---|---|---|---|
| 1 | Porto PDM Art. 3.º o) *moda da cércea*; Paris `plub_filet` code M (PT/FR) | Height is an aggregate over CONTEXT FABRIC, not a scalar; no primitive reads the built environment | `CONTEXT_AGGREGATE(set=frente-urbana, stat=mode, of=cércea)` — with a declared set-definition and a refusal when fabric is absent/unmeasured | constraint (construction) + adapter (set definition) + kernel (frontage extraction). The C58 amendment is already named: `fabricDerivedHeight` (`ptPortoPdmDraft.ts` blocker 4) |
| 2 | BauO NRW 2018 §6 (0.4·H min 3 m); Porto afastamento ≥ H/2 min 3 m (DE/PT) | Setback depends on the building's own height — self-referential; DISTANCE_FROM is a constant | `HEIGHT_PROPORTIONAL_OFFSET(k, min_m, of=wallHeight)` compiling to an inclined boundary plane in the kernel | constraint; H-measurement semantics = adapter DATA per Land (§6 reference-point rules, PENDING primary read — `NRW-SETBACK-ENGINE.md`) |
| 3 | PGM Art. 242.2 (min-30%-free equidistant figure, clamp 11/30 m); Art. 350.2.b (band area EQUALS 70% of block) (ES) | Depth is the solution of an implicit equation on the BLOCK; and the two articles differ by QUANTIFIER (min needs clamps; equality must not be clamped) | `IMPLICIT_BLOCK_SOLVE(condition, quantifier=MIN\|EQUALITY, clamps?)` with a STATIC block-ring input requirement | constraint + kernel solver; `requiresBlockRing`-style static gate (`GeometricRule.ts`) |
| 4 | PGM Art. 327.2 alçada table on amplada de vial (band edges = storeys; refuse near edge); Porto cércea ≤ street width w/ 21 m cap; Madrid COEF_Z per manzana (ES/PT) | Value = banded lookup over a CONSTRUCTED fact; no lookup primitive, no boundary-tolerance/refusal semantics, no official-vs-measured input distinction | `BANDED_LOOKUP(fact, bands[], edgeTolerance→REFUSE)` over a declared fact with a tiered resolution ladder | constraint (table as data) + adapter (fact construction: `ampladaDeVial.ts` ladder) + engine (edge refusal) |
| 5 | Madrid NZ1 Fondo (polyline+COEF_Z); Barcelona clau 18 `OV_Trames` (22.5% of private buildable land); Paris `plub_ecm` (ES/FR) | The published polygon IS the rule; reconstructing it from predicates is a lossy re-derivation (repo doctrine at `ExplicitAreaRuleSchema`) | `EXPLICIT_GEOMETRY_REF(ringRef)` resolved at the provider boundary, never inlined | constraint kind + adapter/provider resolution seat |
| 6 | DK `bebygpctaf` codelist (72–85% of plans non-parcel-scoped); Porto `edificab_m` = perequação macro-zone average, NOT per-parcel FAR; Art. 242.2 open-space is % of BLOCK (DK/PT/ES) | Every ratio constraint (MAX_GFA, MAX_COVERAGE, MIN_OPEN_SPACE, MAX_VOLUME) lacks a denominator; the DK incident is the measured proof | `valueBasis` attribute REQUIRED on every ratio-valued constraint (`{scheme, code}`, national codelists verbatim; non-parcel basis ⇒ refuse the per-parcel multiply) | semantic (schema, mirrors E1a R2) + adapter (codelist import: `vocabularies/dk.ts`) |
| 7 | L-584 rasant-at-façade; Paris HMC = NGF absolute altitude (not applied without terrain); EE `korgus` vs `korgusabs` (EH2000); Porto cércea from MEAN GROUND AT FAÇADE ALIGNMENT; Art. 350.2.e "des de la rasant del carrer" (ES/FR/EE/PT) | MAX_HEIGHT/MIN_HEIGHT carry no datum; four legally distinct quantities share one token | `datum` attribute REQUIRED on every vertical constraint: `relative-to(rasant@façade \| mean-ground@façade \| street-grade \| absolute(NGF\|EH2000\|…))` + per-façade segmentation on slope | semantic + kernel (façade-segment sampling) + provider (terrain) |
| 8 | DK plan ladder (byggefelt 1 → kommuneplanramme 4; min level wins; ties REFUSE); B-Plan Baugrenzen override BauO §6; Paris height = min(plafond, ECM graphic, HMC-relative) (DK/DE/FR) | Multiple co-applicable rules for one parameter; no precedence or combination semantics anywhere in the proposal | `rank {scheme, level}` as a FACT on the rule; resolution ENGINE-side (min level per scheme, tie ⇒ refuse, cross-scheme ⇒ incomparable ⇒ refuse); explicit combinators (`MIN_OF`) for candidate sets | semantic (rank fact) + engine (resolution — repo doctrine: `dkRuleMapper.ts`, `evaluateDeclarative.ts` R1) |
| 9 | PGM Art. 340.2/343.1 (FAR conditioned on parcel area); Art. 342.5 (on street width); BauGB §30/§34/§35 regime gate; R3 legal-vs-ingestion validity windows (ES/DE/EE) | No applicability layer: no conditions, no declared fact vocabulary, no legal-regime gate, no temporal validity | `applicability { condition(JSON-Logic over DECLARED facts), regime, validFrom/validTo + validityBasis }` — undeclared fact ⇒ load-time error (`assertKnownFacts`) | semantic + constraint; the seat EXISTS and is FROZEN: `factVocabulary.ts` — extend append-only, do not rival |
| 10 | EE PLANK serves "" and "0" for unfilled slots (both observed live); SI schema at ~1% fill with SENTINEL ZEROS; DK tier-6 UNKNOWN rows 39–70% by layer (EE/SI/DK) | No representation of UNKNOWN distinct from 0 and from no-limit; a universal engine consuming this vocabulary would draw UNKNOWN as zero or unbounded — the L-616 overstatement | Value lattice `{number \| UNKNOWN \| NOT-APPLICABLE}` with `UNKNOWN ⇒ tier-6 ⇒ never caps/never frees an envelope` (structural, as in `provenance.ts` superRefine + `envelopeSolidHeightCap`) | semantic (L0, already frozen) + engine guard |
| 11 | Baulinie (must build ON the line) vs Baugrenze (must not cross); alineació a vial Art. 349 (DE/ES) | All proposed spatial predicates are inequalities; a mandatory-position equality is inexpressible | `BUILD_TO_LINE(lineRef, offset_m=0)` distinct from limit predicates (repo shape: `alignTo` + `alignmentOffset_m`) | constraint |
| 12 | PGM Arts. 223.2.g/229/230 cossos sortints (vol ≤ min(vial/10, 1.5 m), floors ≥1, ≤1/3 façade, ≥1 m from mitgera) (ES) | Permitted volume OUTSIDE the envelope; evaluable only over a RESOLVED envelope — inverse dependency order | `PROJECTION_ALLOWANCE` in a separate post-envelope morphology layer (omission UNDER-states ⇒ deferrable safely — the repo's own disposition) | semantic (new layer above the envelope), explicitly out of the constraint vocabulary |
| 13 | Córdoba Art. 13.5.2.4 — depth *libre*, only an occupation cap (ES) | An area cap with no siting rule does not determine a unique polygon; "engine determines" is false here | Output kind `LABELLED_CHOICE` — a determination that carries "this ring is PRYZM's documented modelling choice" as a first-class, non-strippable label (`occupation-capped-alignment` branch + `occupationCappedDepth.ts` precedent) | engine output type + semantic |
| 14 | PGM Art. 255 slope-tiered edificabilitat (−20%/−40%/inedificable) (ES) | A SURFACE parameter conditioned on terrain slope; no terrain fact exists in the vocabulary | `slope` as a declared fact (with its own measurement/datum discipline) + condition hook via row 9; INEDIFICABLE as a determinate zero, distinct from UNKNOWN | semantic fact + provider (DTM) + constraint |

**Deliberately NOT added** (the restraint the brief demands): no `SKY_EXPOSURE_PLANE`, no
`SHADOW_CONSTRAINT`, no `VIEW_CORRIDOR`, no `FLOOR_HEIGHT_MODULE` — the corpus as read contains
no PRYZM-met citation for them. STEP_PLANE/INCLINED_PLANE already cover the gabarit/couronnement
class *at the kernel*; their blocker is sourcing, not representation (§1.3).

---

## 4 · UNDERSPECIFICATION FINDINGS (the existing tokens, as proposed)

This is a finding class of its own: **each token below looks implementable and would ship wrong
numbers.** The corpus citation is the proof, not an opinion.

### 4.1 MAX_HEIGHT / MIN_HEIGHT — meaningless without four qualifiers
- **Datum** (see table row 7): rasant-at-façade (L-584 — centroid sampling is the recorded
  defect), mean-ground-at-façade-alignment (Porto Art. 3.º g), street grade (Art. 350.2.e),
  absolute NGF (Paris HMC — deliberately NOT applied as a cap without terrain), absolute EH2000
  (EE `korgusabs`). Paris additionally distinguishes the **plafond** (UG.3.2.1) from a building
  height: *"⚠ It is the plafond, NOT a max building height"* (`frParisPluBioclimatique.ts`).
- **What counts:** Porto cércea INCLUDES recessed storeys, EXCLUDES chimneys/lift rooms/tanks
  (Art. 3.º g — `ptPortoPdmDraft.ts` `defCercea`). Two ordinances with the same metres measure
  different buildings.
- **Per-façade segmentation on slope** — the ordinances carry explicit machinery for sloping
  frontages (L-584 row, `ISSUE-LOG.md:748`); a single scalar per parcel cannot express it.
- **SURVEYED ≠ NORMATIVE** — the E1a entities carry a height *method* enum for exactly this
  (`E1a-canonical-schemas.md`; memory `getcapabilities-is-not-an-inventory.md`).

### 4.2 MAX_FLOORS / MIN_FLOORS
- PB+N (above ground floor — Art. 327.2 `floorsAboveGround`) vs total storeys vs above/below
  ground splits (EE `sbppealne`/`sbpalune`); *Vollgeschoss* is a Land-defined term in DE
  (`BERLIN-RULEPACK.design.ts` extractor comment); Art. 350.2.e states "una única planta
  **indivisible**" — a storey count carried as stated, never derived from height ÷ module
  (`TieredOccupationRuleSchema.interiorTierFloors` doc comment forbids exactly that).

### 4.3 MAX_GFA / MAX_COVERAGE / MIN_OPEN_SPACE / MAX_VOLUME — the ratio family
- **Denominator/basis** (table row 6) — the measured DK incident; also C63: the ratified
  denominator for scoring is BUILDABLE land, not gross land (memory
  `c63-denominator-is-buildable-land.md`).
- **Numerator definition:** GFA is jurisdiction-defined — Porto *área de edificação* excludes
  uncovered terraces, open balconies, public covered space, low attics (Art. 3.º d); DK
  *etagearealet* per BR18 §168–186; EE serves a CLOSED national GFA (`sbp` — "the number NO
  other probed country serves", `eeRuleMapper.ts`). MAX_GFA without the definition is a false
  equivalence across countries.
- **Percent vs fraction** — even the repo's own frozen parameter row carries the ÷100
  calculation explicitly (`DECLARATIVE_PARAMETERS.maxCoveragePercent`); LT `MAX_INTENS` has an
  UNRESOLVED percent-vs-FAR encoding, deliberately given NO unit (`E1a-canonical-schemas.md`).
- **Coverage per TIER:** Art. 350.2 gives 90% ground-floor occupation but a 70%-of-block band
  above the ground floor — one MAX_COVERAGE scalar cannot carry both.
- **FAR alone does not draw** (Telde Lever 3, `esTeldePgo2003.ts`: rows A1–A5 REFUSED — "an
  envelope built from FAR alone silently occupies the entire plot"). The vocabulary needs the
  rule that SURFACE constraints without a footprint rule produce **no polygon**, not a full-plot
  polygon.

### 4.4 DISTANCE_FROM / OFFSET_FROM / WITHIN_BUFFER
- **From WHICH line?** Cadastral edge vs official alignment differ (`alignTo:
  'street'|'official-line'`, Madrid publishes alignments as their own layer); Telde `DispObl =
  'GRF'` = the datum line is ON A PLAN SHEET and not held — packed as a REFUSAL, because
  substituting the cadastral edge "would draw a different building" (`esTeldePgo2003.ts`); Telde
  row C: a 21 m fondo whose datum EDGE is unknown ⇒ refused.
- **Measured HOW?** Art. 25 NNUU: perpendicular between opposing alignments (recorded in
  `factVocabulary.ts` `ampladaDeVialM.space`); Murcia lesson: **never measure after a lossy
  reprojection** (memory `murcia-pgou-ejes-is-road-axis.md`); the vocabulary has no CRS/space
  discipline at all, where the repo's is structural (`NativeCrsGeometry` — the CRS travels with
  the coordinates).
- **Edge classification is a prerequisite:** front/side/rear are not given by the cadastre; the
  proposed vocabulary presumes a classified parcel boundary it never defines.

### 4.5 The SPATIAL predicate set (INSIDE/OUTSIDE/INTERSECTS/TOUCHES)
Fine as a *compliance-check* tier; but as *determination* inputs they are non-constructive, and
the proposal does not say which tier they serve. The repo's verification≠dispatch≠rendering
lesson (memory `verification-dispatch-rendering-three-milestones.md`) applies verbatim: check
predicates and construction operators are different milestones and must not share a list.

### 4.6 BOOLEAN + PLANAR
Materially adequate (Paris = extrude ∩ ceiling − EAL; Sevilla fondo clip). Two cautions:
(a) SUBTRACT must specify whether an area-only deduction is admissible when the strip geometry
is absent (Paris EAL falls back to a conservative whole-area deduction — a documented,
direction-safe choice); (b) kernel robustness on real cadastral rings is a certified-risk area
of its own — L-581's mixed-setback inset collapse on 0.2 m edges is the measured precedent; the
kernel needs a failure taxonomy the engine can distinguish from a legal impossibility (the exact
category error L-581 documents).

---

## 5 · CLASSES THAT GENUINELY CANNOT BE REPRESENTED WITHOUT COUNTRY-SPECIFIC LOGIC — AND WHAT THAT MEANS

**Class A — country-specific CONSTRUCTIONS (representable as parameterized kinds, with
country-specific solvers behind a frozen seam).** Street-width ladders (#7), block-implicit
solves (#4), moda aggregation (#1), Abstandsflächen H-semantics (#3). These need per-country
*data* and occasionally a new *solver branch*, but the repo's six-kind history shows the honest
architecture: **a discriminated, append-only kind registry where a new kind is minted by
ADR + citation, and the exhaustive switch makes an unsolved kind a COMPILE error** (KG-4,
`esMadridNZ1.ts` header: "the designed-in safety gate, not a bug to work around"). Rate of
growth observed: ~6 kinds for ~2 countries deeply done — expect low double digits for Europe,
not hundreds. That is heterogeneity the hypothesis under-counts but does not break.

**Class B — the state already computed the geometry (representable only by reference).** Madrid
NZ1, clau 18, Paris ECM, DK byggefelt polygons. Needs the `EXPLICIT_GEOMETRY_REF` tier (table
row 5) + provider resolvers. Not an escape hatch — a first-class citizen; on the measured
corpus it covers some of the highest-value land (22.5% of Barcelona's private buildable land).

**Class C — not geometry at all (representable only as refusal/caveat).** §34/§35 regimes,
per-ficha case law, funktionslos risk, pre-1956-deed triggers, missing ficheros, DK `kompleks`
plans ("rules too complex to structure — PDF-only" — the *register's own* honesty flag,
`dkRuleMapper.ts`). **The architecture's answer must be the refusal object with citation and
knownFacts** — the corpus shows this is a large, permanent share of output, not an error path.

### On the "per-country kernel plug-in seat" question
**Recommend AGAINST an arbitrary-code plug-in seat.** The repo's whole governance record argues
the opposite design: free plug-in code is where an unsourced number, an unclamped equality, or a
silently-swallowed UNKNOWN enters without a gate (the L-616/L-449 families). The escape valves
that already exist and suffice: (1) mint a new frozen KIND via ADR — compile-gated until the
engine branch lands; (2) `EXPLICIT_GEOMETRY_REF` when the state publishes geometry; (3) the
cited refusal (with `kompleks`-style flags) when neither applies; (4) `LABELLED_CHOICE` when the
law under-determines the shape. If a plug-in seat is created anyway, its rules must be: data-only
parameterization of a registered kind (never new geometry code), every emitted value carries the
E1a provenance record, output restricted to the four determination kinds above, and the
never-overstate gate extended over it before first registration.

---

## 6 · SUMMARY DISPOSITION

| Hypothesis clause | Verdict |
|---|---|
| "Geometric constraints are substantially less heterogeneous than the regulations" | TRUE at the kernel (planes/prisms/booleans), UNDER-COUNTED at the constraint layer (6 kinds for ~2 countries; constructions, quantifiers, datums, bases are where the variance lives) |
| "Country adapters interpret" | CONFIRMED — and already built (E1a/E1d/DK/EE/PT adapters); adapters must also carry codelists, ladders, and set-definitions, not just parsing |
| "A universal constraint vocabulary represents" | REJECTED as proposed: the 24 tokens cover the kernel + a naive parameter list; missing constructions, datum, basis, rank, applicability, UNKNOWN, refusal, geometry-ref, quantifier — 14 cited gaps in §3. Must extend the FROZEN E1a/E1bc seats append-only, not rival them (C84 EI-9) |
| "ONE universal geometric engine determines" | WEAKEN to: one engine **determines, determines-per-component, draws a labelled choice, or refuses with citation** — all four output kinds are forced by shipped rules (Paris / Córdoba / Zürich) |
| Implicit premise: representation is the bottleneck | REFUTED by E5/E8 measurement — sourcing/extraction/signature is the bottleneck (envelope state-served 0/21; DE ~87% scanned; Paris's representable crown still refused for want of structured data) |
