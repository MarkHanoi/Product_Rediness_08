# RECONCILIATION — the Envelope Parameter Reference (A1–F8) + Sufficiency Legends (L0–L7) vs the AS-BUILT system

**Lane ENV-RECONCILE · 2026-09-02 · read-only · tree at `a9f8b1ef` (+ uncommitted S1/K1 work-in-tree, listed §0).**
Companions reconciled: `docs/01-strategy/STR-ENVELOPE-PARAMETER-REFERENCE.md` (v0.2) +
`docs/01-strategy/STR-ENVELOPE-SUFFICIENCY-LEGENDS.md` (v0.1). As-built citations reuse the
2026-09-02 audit (`ENVELOPE-ARCHITECTURE-AUDIT.md`, `VALIDATION-MATRIX.md`, `matrix-west.md`,
`matrix-north.md`, `lane-c-asbuilt-risk-hardcases.md`) and were re-verified against the tree
where load-bearing.

---

## 0 · The in-flight S1/K1 state, measured in THIS tree

| Piece | State | Where |
|---|---|---|
| S1 datum schema (ADR-0377) | **COMMITTED at HEAD** | `packages/schemas/src/site/HeightDatum.ts:53–88` — 8-member union: `facade-rasant`, `street-level`, `mean-ground-at-facade`, `absolute-national`+frame `{NGF,NHN,EH2000}`, `terrain-highest`, `terrain-lowest`, `unknown`; `UNKNOWN_HEIGHT_DATUM` + total `heightDatumOf` (:91–101) |
| S1 zone seat `heightDatum` | **UNCOMMITTED diff** | `packages/schemas/src/site/zoning/JurisdictionZoningContract.ts` (working tree): optional field + superRefine refusing a specific datum on a null height |
| S1 datum resolver | **UNTRACKED** | `packages/site-parcel-data/src/rulepacks/declarative/heightDatumResolver.ts` — `facade-rasant`→Art. 240 machinery WIRED; `absolute-national` FLAGGED-never-resolved; `unknown` REFUSED; exhaustive switch |
| S1 HPO evaluator (ADR-0378) | **UNTRACKED** | `packages/site-parcel-data/src/rulepacks/declarative/evaluateHeightProportionalOffset.ts` — closed-form `max(factor·H, min)` POST-height-resolution; refuses on unresolved H / unknown datum |
| S1 context-aggregate evaluator | **UNTRACKED** | `packages/site-parcel-data/src/rulepacks/declarative/evaluateContextAggregate.ts` — extent-weighted mode over a typed `ContextSetInput`; unavailable ≠ empty; refuse-on-tie |
| K1 inclined tops | **UNTRACKED** | `packages/site-parcel-data/src/geometry/inclinedTop.ts` — height field `h(p)=max(0,min(flatCap,minᵢ planeᵢ(p)))`; exact ∫∫h dA; inscribed tiers (drawn solid UNDER-states) |
| K1 polygon difference | **UNTRACKED** | `packages/site-parcel-data/src/geometry/polygonDifference.ts` |
| ⚠ Coordination fact | The two untracked evaluators import `HeightProportionalOffsetRule` / `ContextAggregateRule` from `@pryzm/schemas`, and **those types exist nowhere in `packages/schemas/src` in this tree** (grep: zero hits). The parallel SEATS lane owns the kinds (the evaluators' own headers say so). Not a defect of the design — a fact about tree state: C6/A6 rows below say IN-FLIGHT, with the schema-kind seam still open here. |

---

## T1 — PER-ATTRIBUTE MAP (A1…F8 → as-built seat · honest strength column)

Strength = "as-built is STRONGER / EQUAL / WEAKER than what the reference row asks".

| # | Attribute | As-built seat (file / kind / field) | Status | Strength |
|---|---|---|---|---|
| A1 | Parcel polygon | `packages/schemas/src/site/Parcel.ts` + `parcelProviders/*` chain; CRS travels with coordinates (`geometry/nativeCrs.ts`, NativeCrsGeometry); area = declared fact `parcelAreaM2`, "never re-measured inside a rule pack" (`rulepacks/declarative/factVocabulary.ts:75–88`); boundary provenance `site/ParcelProvenance.ts` | BUILT | **EQUAL→STRONGER** (typed CRS discipline; single-measurement rule) |
| A2 | Height reference datum | `packages/schemas/src/site/HeightDatum.ts:53–88` (ADR-0377) + zone seat (uncommitted, §0) + `heightDatumResolver.ts`; beneath it the shipped Art. 240 machinery `geometry/facadeRasantDatum.ts` (240.1.a/b two-branch, 240.3 corner both branches, 240.4 — `matrix-west.md` row 10 PASS) | **IN-FLIGHT (S1)** | **STRONGER as a model** — the reference asks "point or surface"; as-built types WHICH LEGAL PLANE, refuses `unknown`, and rejects incoherent datum-without-height at parse. Resolution-to-metres is wired only for `facade-rasant`; `absolute-national` is flagged-not-resolved (needs terrain + frame conversion — GAP A#7/A#14) |
| A3 | Frontage classification (per-edge enum: public / party / rear / open) | Per-frontage-TYPE only: setback kind `{front_m, side_m, rear_m}` (`packages/schemas/src/site/GeometricRule.ts:53`); street-frontage vs interior edge classification computed inside `geometry/blockRing.ts:734–784` (midpoint sampling); party-wall config `geometry/blockDerivedDepth.ts:57,160` (*mitgera*); `sideTreatment: 'party-wall'` (`complianceReport.ts:136`) | PARTIAL | **WEAKER** — classification is EMERGENT per-solver, not a first-class typed per-edge attribute of the parcel. Feeds the L5/E1 gaps below |
| A4 | Right-of-way width per frontage, **nominal** | `rulepacks/ampladaDeVial.ts` (declared-nominal ladder: official table → constructed; `curated-cerda-nominal` :17–20; "the allow-list carries the NOMINAL" :215; `trustedOfficialWidth` :136) + `bcnOfficialStreetWidths.ts`; `madridAnchoDeCalle.ts` + `esMurciaAnchoDeCalle.ts` + `providers/resolveMurciaStreetWidth.ts`; band-edge TOO-CLOSE refusal (`madridAnchoDeCalle.ts:191`; C58 line ~300: only the two strongest tiers disarm the guard); declared fact `ampladaDeVialM` (`factVocabulary.ts`) | BUILT | **STRONGER** — holds the nominal/measured distinction AND refuses at band edges (the reference's "0.4 m costs two storeys" case is guarded machinery, not prose). ⚠ Reference correction: Madrid PGOUM keys on the width **measured at the façade midpoint** (`madridAnchoDeCalle.ts:16–18`) — the reference's blanket "nominal, never a measurement" over-generalises |
| A5 | Terrain surface (DTM/TIN) | Rasant machinery takes INJECTED samples (`facadeRasantDatum.ts`; resolver header); Art. 255 slope-tiered edificabilitat **NOT applied** — "PRYZM holds no terrain model" (`rulepacks/esBarcelona20aAillada.ts:170–172`), `SLOPE_CAVEAT` on every hillside resolution (:204–222); terrain exists display-side only (`tools/context-bake/terrain.mjs`) | PARTIAL | **WEAKER** — no DTM in the legal path; slope rules caveat-carried with stated direction ("figure above is an UPPER BOUND"). Matrix GAP A#14 |
| A6 | Adjacent heights + party-wall positions | Typed input seat arriving: `ContextSetInput` / `ContextFabricMember {value_m, extent_m, sourceId}` (`evaluateContextAggregate.ts:52–66`, unavailable ≠ empty); buildings federation SHIPPED (`src/buildingsFederation/{conflate,sourcePriority,gersId,odblStore}.ts` → canonical `SiteIntelBuilding`); non-normative sibling `ContextDerivedStudyEnvelope` | **IN-FLIGHT (S1) + PARTIAL** | **WEAKER on plumbing** — no wiring yet from federation/context tiles → `ContextSetInput` (the *frente urbana* extractor is unowned); party-wall POSITIONS not a typed input anywhere |
| B1 | Governing instrument + version + date | `siteintel/provenance.ts`: `source{country,authority,dataset,plan,object,document,article,page}` (:69), `valid_from`/`valid_to` + `validityBasis: 'legal'|'ingestion'` (:179); `ZoningProvenance.version` (`site/zoning/ZoningRecord.ts:25–27`); `SiteIntelVersion` (`siteintel/entities.ts:672`); `ruleSetVersion` (:608); `isInForceOn` (matrix temporal row PASS) | BUILT | **STRONGER** — the legal-vs-ingestion validity split is an axis the reference doesn't name |
| B2 | Zone code, jurisdiction-native | `ZoningRecord.zoneCode` — "ES `clau` / Madrid norma zonal / DK anvendelse" (`ZoningRecord.ts:36–37`), never normalised | BUILT | **EQUAL** |
| B3 | Subzone | Pack-level subzone tables: `bcn20aSubzones.ts`; Art. 327 subzona I/V ladders (`bcnAlcadaReguladora.ts`, `bcnAlcada20aAillada.ts` — Art. 342.5 four-column ladder, matrix PASS); 13a/13b in `esBarcelonaEnsanche.ts` | BUILT | **EQUAL** (carried in the native code + pack structure; no canonical `subzone` field, none needed — the native code IS the citation unit) |
| B4 | Overlay stack, **ordered** | `ZoningRecord.overlays` = **UNORDERED** `z.array(z.string())` (`ZoningRecord.ts:43`) and **consumed by NOTHING** in the solve path (producers only: `luSources.ts`, `mapPlandataToZoningRecord.ts`, `resolveMurciaZoning.ts`, `estimatedDefault.ts`, `saRiyadhDemo.ts`, `nycPlutoParcelProvider.ts`). Live overlays are bespoke providers (heritage/flood/clau 18 — `matrix-west.md` §11 PASS for ES; NL paraplu picked-around ⛔ D4) | PARTIAL | **WEAKER** — the reference's ORDER requirement **strengthens the audit finding**: the fix must deliver an ordered stack + declared conflict order (E3), not mere consumption |
| B5 | Site-specific override flag | Typed refusal family: `derived-plan` (`BuildableEnvelope.ts:189,250` — "the general plan POINTS AT ANOTHER DOCUMENT"), `regime-undetermined` (:217,254, ADR-0274), closed code set + `{code, headline, detail, ordinanceRef, legallyGrounded}` (C58 §1.13), retry-safety semantics (:300–307) | BUILT | **STRONGER** — richer than a Boolean+ref: distinguishes derived-plan vs regime-undetermined vs no-plan, and encodes what retrying can and cannot fix |
| C1 | **Ordering type** (enum, the master switch) | **NO `orderingType` token exists anywhere** in schemas or packs (grep: zero). De-facto discriminator = the `GeometricRule.kind` union, 6 kinds (`GeometricRule.ts:53–368`: `setback` / `alignment` / `block-derived-alignment` / `tiered-occupation` / `occupation-capped-alignment` / `explicit-area`), chosen per-zone BY THE PACK | **MISSING as an explicit selector** | **WEAKER at zone level / STRONGER at rule level** — the kind union is finer than the reference's 4-value enum and compile-gated exhaustive, but legend selection is implicit-per-pack. **This is the T2 named finding** |
| C2 | Max height | `ZoningRuleSchema.maxHeight_m` (`JurisdictionZoningContract.ts:46`); constructed heights via `applyConstructedHeight` (per-street *alçada reguladora*, `farLimitedHeight.ts` header) | BUILT | **EQUAL** (STRONGER once S1's datum lands beside it) |
| C3 | Max storeys | `maxFloors` (`JurisdictionZoningContract.ts`; `ZoningRulesEngine.ts:245–248`); `tieredMaxFloors` (:782); `storeyCap.ts` | BUILT | **EQUAL** |
| C4 | Footprint limit (ratio OR depth) | Both forms: `maxCoverage` 0..1 fraction; depth via `alignment`/`block-derived-alignment` kinds + `geometry/{blockDerivedDepth,depthBandClip,occupationCappedDepth}.ts`; per-illa depth = the Art. 242.2 bisection (independent-oracle-audited) | BUILT | **EQUAL** — "which form applies" is decided by kind (C1-implicit, see above) |
| C5 | Setbacks per frontage type | `setback` kind `{front_m, side_m, rear_m}` + `geometry/insetPolygon.ts` (per-edge, setback-vs-party-wall calls :371) | BUILT | **EQUAL**, minus: distance-between-buildings-on-the-same-plot has no seat (an L3 *refines*, not a precondition) |
| C6 | Shaping constraints (planes, offset surfaces) | K1 `geometry/inclinedTop.ts` + `polygonDifference.ts`; S1 `evaluateHeightProportionalOffset.ts` (DE §6 0,4·H min 3 m; Porto H/2; Madrid NZ5) — **schema kinds not yet on disk in this tree** (§0) | **IN-FLIGHT (S1+K1)** | **EQUAL when landed** — and the no-single-pass warning (Legends A.4) is answered by design: closed-form post-height-resolution + the shipped monotone bisection precedent (`solveBlockDerivedDepth`), matching A.4's "or solve the closed form" |
| D1 | Floor area limit | `plotRatioFAR`; **R2 `valueBasis`** on provenance (`provenance.ts:147–158` — the DK denominator fix); nullable-by-default, so France's no-D1 system is representable (the reference's own requirement) | BUILT | **STRONGER** — the denominator-basis axis (parcel vs plan-area) is machinery the reference doesn't ask for and once shipped a national bug without |
| D2 | Floor-area exclusion rules | **NOTHING.** No sellable-area, counts-toward, core/balcony/basement exclusion machinery anywhere in `packages/schemas` or `packages/site-parcel-data` (grep: only BIM `elements/Balcony.ts`, unrelated) | **MISSING** | **WEAKER (absent)** — the 10–15% sellable-area axis is un-modelled end-to-end; not on IMPLEMENT-NOW or RESEARCH-LATER |
| D3 | Bonuses and increments | The reference's own worked example is shipped AS DOCTRINE: `EIXAMPLE_CORNICE_INCREMENT_MAX_M = 2.25` surfaced as an *available allowance*, **never applied** because its conditions (Conjunt Especial + pre-1932 neighbours) are unverifiable (`bcnAlcadaReguladora.ts:355–380`); nucli antic +10% NOT APPLIED — discretionary (`bcnAlcadaNucliAntic.ts:170–181`) | PARTIAL | **EQUAL in doctrine, WEAKER in machinery** — conditional uplifts are carried-and-refused honestly, but there is no general conditional-increment rule kind |
| E1 | Multi-frontage resolution (corner carry-around) | Corner DATUM shipped both branches (`facadeRasantDatum.ts:43,158` — Art. 240.3/240.4); corner frontage classification (`blockRing.ts:783–784`); **height carry-around-the-corner: zero machinery** (grep cantonada/xamfrà/chaflán/carry: none) | PARTIAL | **WEAKER** — A.4's "segment the façade, solve per segment, reconcile at the step" is unimplemented; no shipped pack has yet demanded it (why it's absent, and why it's deferrable) |
| E2 | Height / storey precedence | Joint resolution (`ZoningRulesEngine.ts:269` — height and floors both in `resolutions`); Art. 342.5 ladder resolves height+storeys jointly; `farLimitedHeight.ts` (tighter governs; `ASSUMED_FLOOR_TO_FLOOR_M = 3.0` surfaced via `floorHeightAssumed`, never silent); `storeyCap.ts` (`StoreyCapBinding: 'height'|'far'`) | BUILT | **EQUAL** — minor gap: no canonical minimum-floor-to-floor FIELD (the 3.05 m/4 m-ground-floor class lives per-pack; the assumption is at least surfaced) |
| E3 | Overlay conflict order | Precedence FACT seat exists: `RuleApplicability.rank` (`siteintel/entities.ts:377–378`) + refuse-on-tie doctrine (audit §4.2, Catala prior art; DK rank-as-fact endorsed by execution); overlay ORDER declared nowhere (see B4) | PARTIAL | **WEAKER** — rank exists for instruments; overlay conflict order is the unbuilt half (audit P4 "Precedence completion") |
| E4 | Prescriptive vs discretionary (enum + range) | Discretionary jurisdictions refuse at the provider (`gbOsInspireParcelProvider.ts:30`, `scotlandRosParcelProvider.ts:48`, `walloniaParcelProvider.ts:37`); discretionary allowances not applied (CPPHAN — `esMadridPgoum97.ts:31`; `esMalaga.ts:1062`); R5 `normativeForce` = VERBATIM MIRRORED STRING, deliberately never harmonised (`provenance.ts:159–167`). Range half: see L7 row in T2 | PARTIAL | **EQUAL in behaviour, DIFFERENT in shape** — ⚠ design tension flagged in §V: the reference's normalising ENUM collides with the frozen verbatim-mirror doctrine |
| E5 | Quantum trimming policy (declared) | `farLimitedHeight.ts` implements exactly ONE of Legends A.6's four options — **full floors from the ground up** over the footprint (`floorsByFAR = maxGFA / footprintArea`; solid drawn at `farLimitedHeight_m`) — applied identically everywhere, surfaced via `binds` | PARTIAL | **WEAKER on declaration** — the policy is real, consistent, and UNDECLARED; the reference requires it labelled as a product decision in the output ("the one number that does not derive from an article"). Delta = declaration, not math |
| F1 | value + unit | Units on every canonical parameter (`DECLARATIVE_PARAMETERS.unit`, `DeclarativeFact.unit` — `factVocabulary.ts`); unit-in-name C58 fields (`maxHeight_m`) | BUILT | **EQUAL** |
| F2 | instrument + version + date in force | See B1 | BUILT | **STRONGER** (validityBasis split) |
| F3 | article | `source.article` (`provenance.ts:95`); `DerivationEntry.ordinanceRef` per numeric constraint (`BuildableEnvelope.ts:133–143`); refusals cite what was read (C58 §1.13.4) | BUILT | **EQUAL** |
| F4 | derivation method (direct / table-lookup / computed / interpolated / inferred) | `RuleDerivationSchema = {DIRECT, DERIVED, AI_EXTRACTED, HUMAN_VALIDATED}` (`provenance.ts:48–53`) + coherence superRefines (tier-1+AI_EXTRACTED incoherent :201–206; tier-5 requires HUMAN_VALIDATED :219–224) | BUILT | **DIFFERENT partition, net STRONGER** — folds table-lookup/computed/interpolated into DERIVED (the calculation itself is data: `c58Calculation`, `factVocabulary.ts`) but adds the extraction/validation axis with parse-time coherence checks the reference lacks. Adopting the reference's 5-enum literally would REGRESS this |
| F5 | inputs (inspectable chain) | Evidence chain zone→plan→document→article→rule→verbatim→calculation→value; `walkEvidenceChain` fails NAMING the missing hop (`lane-e1bc-evaluator-golden-parity.md`); lookup inputs are declared facts (`ampladaDeVialM`) | BUILT | **EQUAL** |
| F6 | retrieved_at | `validityBasis: 'ingestion'` windows; `SiteIntelVersion` (`entities.ts:672`); `Scenario.asOfDate` (:551); `ruleSetVersion` (:608); `sampledAtIso` on context studies. **No literal per-value `retrieved_at` field** on `RuleProvenance` | PARTIAL | **EQUAL-ish** — the axis is covered by ingestion-versioning; the per-value timestamp literal is a minor absent nicety |
| F7 | confidence (resolved / assumed / unresolved) | **SIX-tier** `SiteIntelConfidenceTierSchema` (`siteintel/confidence.ts:63–71`: authoritative-machine-readable / authoritative-document-derived / deterministic-inference / ai-interpretation / human-validated / uncertain-missing; value=null ⇔ tier 6, superRefine-enforced) + the six-member ordered `EnvelopeConfidenceSchema` (`site/zoning/ProvenanceFlags.ts:80–92`, §ENVELOPE-CONFIDENCE-LADDER L-664, single source of truth) | BUILT | **STRONGER — the reference must NOT regress it.** Mapping: resolved→tiers 1–5; unresolved→tier 6; "assumed" → surfaced-assumption flags (`floorHeightAssumed`, `SLOPE_CAVEAT`) — finer than a 3-value enum |
| F8 | refusal_reason | Structured `refusal {code, headline, detail, ordinanceRef, legallyGrounded}` over a CLOSED code set, present-iff-refusing refinement (C58 §1.13; `BuildableEnvelope.ts:244,645–676`); our-gap-vs-law's-answer separation (`legallyGrounded`; L-616 / Murcia §R-7 "never attribute our gap to the law", restated in `heightDatumResolver.ts` header) | BUILT | **STRONGER** — closed vocabulary + the legallyGrounded axis vs the reference's free-text reason |

**The irreducible 8-field core** (A1, A2, A4, C1, C2, C3, C4, C5): **seven of eight seated**
(A2 in-flight, the rest shipped). The eighth — **C1 as an explicit selector — is the one missing
field**, and it is the load-bearing one for the Legends' generalisation claim.

---

## T2 — PER-LEGEND MAP (L0…L7 → shipped embodiment)

| Legend | Shipped embodiment today | State |
|---|---|---|
| **L0** Explicit volume | `rulepacks/esBarcelonaVolumetria18.ts` (clau 18 `OV_Trames` explicit geometry, SIG-3 signed; 22.5% of BCN private buildable land) · `rulepacks/esMadridNZ1Provider.ts` (NZ1 ring) · FR ECM polygon — all via the `explicit-area` kind (`GeometricRule.ts:368`) + `geometry/explicitArea.ts` (multi-part fix in tree) | **BUILT** |
| **L1** Footprint + height | `providers/resolveNlBestemmingsplan.ts` (*bouwvlak* + *maatvoering* proxy layers → explicit-area + height); courtyard-hole honesty closed 2026-09-02 (L-12896, commit `37aec97a` + `__tests__/nlBouwvlakHoles.test.ts`) | **BUILT** (⛔ paraplu/dubbelbestemming pick-around caveat — matrix D4, feeds B4) |
| **L2** Aligned to street | The richest family: `rulepacks/esBarcelonaEnsanche.ts` + `alignment` / `block-derived-alignment` kinds + `geometry/blockDerivedDepth.ts` (Art. 242.2 bisection) + `rulepacks/ampladaDeVial.ts` + `bcnAlcadaReguladora.ts` (Art. 327 tables) + `madridAnchoDeCalle.ts` / `esMurciaAnchoDeCalle.ts` | **BUILT** |
| **L3** Free-standing, ratios | `rulepacks/esBarcelona20aAillada.ts` + its declarative twin `esBarcelona20aAillada.decl.json` (byte parity 11/11) + `setback` kind + `geometry/insetPolygon.ts` + `maxCoverage` + `tiered-occupation` (Art. 350.2 live via `esBarcelonaIndustrial.ts`, engine :629–762) | **BUILT** |
| **L4** Shaped | **The K1+S1 in-flight pair**: `geometry/inclinedTop.ts` (height-field min-of-planes) + `evaluateHeightProportionalOffset.ts` (0,4·H closed form); schema kinds pending (SEATS lane, §0). A.4's fixed-point warning answered by the closed-form-post-height-resolution design | **IN-FLIGHT** |
| **L5** Terraced / row | No dedicated route. Nearest machinery: party-wall configuration (`blockDerivedDepth.ts:160` *mitgera*; `complianceReport.ts:136` `sideTreatment: 'party-wall'`; `dkPerimeterBlock.ts` karré) + one terraced pack riding P2/P3 machinery (`esSevilla.ts:784`, Art. 12.7.1). Missing inputs are A3-per-edge + party-line POSITIONS — not a new engine family | **PARTIAL** |
| **L6** Contextual | `evaluateContextAggregate.ts` (in-flight; Porto *moda da cércea* / FUC tipo I, founder-signed flip rides it; `countryAdapters/pt/ptPortoPdmDraft.ts` blocked on the kind) + the SHIPPED non-normative sibling `ContextDerivedStudyEnvelope` (offered only beside a refusal) | **IN-FLIGHT + PARTIAL** |
| **L7** Discretionary | Refusal-by-doctrine at providers (GB `gbOsInspireParcelProvider.ts:30`, Scotland `:48`, Wallonia `:37`) **plus the range-typed non-prescriptive output the reference asks for, which EXISTS**: `site/zoning/ContextDerivedStudyEnvelope.ts` — `minHeight_m`/`medianHeight_m`/`maxHeight_m` (:100–102), MANDATORY disclaimer + stated basis (method/source/sample/radius/date), own one-member status literal `'context-derived-study'` structurally unmixable with `EnvelopeStatus`/`EnvelopeConfidence`, deliberately NO `ordinanceRef`. Missing: policy-/precedent-/daylight-derived basis kinds (basis union today = median-of-neighbours · user-supplied, §MANUALENV159) | **PARTIAL-BUILT** — better than the audit implied |

### The legend-selection question (the NAMED FINDING)

**`C1 orderingType` does not exist as an explicit typed selector.** Grep across
`packages/schemas/src` and `packages/site-parcel-data/src`: zero hits (the only `ordering`
matches are unrelated doc-prose in `EnvelopeAxisWeight.ts` / `ProvenanceFlags.ts` /
`BuildableEnvelope.ts:79`). Legend selection today is **implicit per-pack**: `jurisdictionId` →
rule-pack registry → the pack wires each zone to a `GeometricRule.kind`. The kind union is
finer-grained than the reference's four-value enum and compile-gated exhaustive — so selection is
TYPED at the rule level — but there is no zone-level datum saying "this zone is
aligned-to-street", and therefore **A.7 step 4's generalisation claim ("adding a country = mapping
its ordering types to existing legends, never engine branches") is not yet checkable as data.**
Adding a country today writes a pack that ENCODES the legend in code paths; nothing can verify
"no engine branch was added" except code review. The selector is one append-only enum field on
the zone/pack record + a mapping table to kinds — NOT a new model layer (it must pass the same
E4-control-2 test that killed the constraint graph).

---

## T3 — THE GENUINELY-NEW DELTA vs the VALIDATION-MATRIX IMPLEMENT-NOW list

Matrix IMPLEMENT-NOW, for reference: (1) NL hole fix — **shipped** `37aec97a`; (2) inclined tops
+ difference + holes — **K1 in-flight**; (3) `datum` / `HEIGHT_PROPORTIONAL_OFFSET` /
`CONTEXT_AGGREGATE` seats — **S1 in-flight** (kinds pending); (4) gate fixtures for live routes —
in-flight (`audit/demo-esfrpt/2026-09-02/lane-g1-gate-fixtures.md`); (5) overlay consumption
wiring; (6) QualifierLexicon merge.

| Candidate | Finding | Verdict |
|---|---|---|
| **D2 floor-area exclusion rules** (10–15% sellable-area axis) | Nothing in the model — no exclusion rule set, no counts-toward machinery, no sellable-area concept anywhere (grep zero in both packages). Not on IMPLEMENT-NOW or RESEARCH-LATER. The reference is right that this error class reaches the financial model | **NEW-WORK** (the largest genuinely-new surface) |
| **E5 / A.6 declared trimming policy** | The audit's "France dodges it" framing is beside the point — **ES with D1 does not dodge it, and neither does the code**: `farLimitedHeight.ts` ships ONE consistent implicit policy (full floors from the ground up), surfaced via `binds`/caveat but **declared nowhere as a labelled product decision**. Delta = a typed policy declaration in the output, not new math | **NEW-WORK** (small, high honesty-value) |
| **B4 ordered overlay stack** | `ZoningRecord.overlays` is an UNORDERED string array (`ZoningRecord.ts:43`) consumed by nothing — audit finding confirmed at today's tree. The reference's ORDER requirement **strengthens** it: IMPLEMENT-NOW #5 says "consumption wiring"; the reference upgrades the spec to *ordered stack + declared conflict order (E3) + refuse-on-tie* | **ALREADY-LISTED, spec STRENGTHENED** (fold into audit P4) |
| **A6 neighbor-height input plumbing** | The typed seat exists in-flight (`ContextSetInput`, `evaluateContextAggregate.ts:52–66`) and IMPLEMENT-NOW #3 covers the KIND — but the **extractor** that builds the context set from `buildingsFederation`/context tiles (the *frente urbana* walk) is listed nowhere and owned by no lane | **PARTIALLY-LISTED — the plumbing is NEW-WORK** |
| **E1 corner carry-around** | Corner datum shipped (Art. 240.3, `facadeRasantDatum.ts:43`); height carry-around zero machinery; Legends A.4 names the algorithm (segment / solve per segment / reconcile at the step). No shipped pack has needed it yet | **NEW-WORK (research-class; defer until a pack demands it, but register)** |
| **L7 range-typed non-prescriptive output** | C58 itself carries no range type (grep zero) — correctly: the range lives BESIDE C58 by design in `ContextDerivedStudyEnvelope` (min/median/max + mandatory disclaimer + own status literal). Delta = additional basis kinds (policy-/precedent-/daylight-derived) whenever GB ships | **ALREADY-BUILT** (in substance; basis-kind extension later) |
| **A4 nominal-vs-measured street width** | The ES modules hold the distinction explicitly: `ampladaDeVial.ts` nominal ladder + `trustedOfficialWidth`; `madridAnchoDeCalle.ts` documents that the PGOUM keys on MEASURED-at-midpoint and refuses near band edges. The NOMINAL distinction holds — and Madrid shows the reference's "always nominal" claim needs softening to "nominal-first, jurisdiction-declared" | **ALREADY-BUILT** (+ one reference correction) |
| **V4 absolute datum** | `HeightDatum` `absolute-national` + frame `{NGF, NHN, EH2000}` (`HeightDatum.ts:53,63–67`) covers the REPRESENTATION; `heightDatumResolver.ts` flags-never-resolves pending terrain + frame conversion (the honest half-step). The S1 seat covers V4's schema need; resolution-to-cap is the shared A#7/A#14 terrain gap | **ALREADY-IN-FLIGHT** (representation) / terrain-conversion remains |

---

## VERDICT

**YES — the as-built + in-flight system SATISFIES the reference's model in substance, with seven
named deltas.** All three functional slots (Ω/P/V) and eleven of the twelve fill-paths have seats:
P1 (`explicit-area`), P2 (alignment + depth family), P3 (setbacks + coverage), P4 (insetPolygon),
P5/V6 (K1+S1, in-flight), V1/V2/V3 (height/floors/joint + farLimitedHeight), V4 (S1
representation), V5 (S1 evaluator, plumbing open). The degradation ladder (A.5) is materially the
shipped C58 §1.13 refusal family + granularity + caveat machinery; the A.7 procedure is the
shipped engine order in all but one step — **step 3/4, legend selection, which is implicit
per-pack because `orderingType` exists nowhere as data. That is the single largest reconciliation
finding.**

**Named deltas (what the reference asks that the system does not yet hold):**
1. C1 explicit ordering-type selector (T2 finding — gates A.7 step 4's generalisation claim);
2. D2 floor-area exclusion rules (absent end-to-end);
3. E5 declared-and-labelled trimming policy (implicit today in `farLimitedHeight.ts`);
4. B4/E3 ordered overlay stack + declared conflict order (strengthens audit P4);
5. A3 per-edge frontage classification as a typed attribute (feeds L5, E1, C5);
6. E1 corner height carry-around (research-class);
7. F6 per-value `retrieved_at` literal (minor).

**Does the reference CONTRADICT the audit's REVISE rulings?** No structural conflict — the
legends map onto rule kinds + packs with no constraint graph, and A.7's "never engine branches"
is the audit's own data-over-procedure pressure. But **five tensions are flagged rather than
harmonised** (the reference must yield in the first three; the last two are its own corrections):

- **F7:** the reference's 3-value confidence would REGRESS the shipped SIX-tier ladder
  (`confidence.ts:63`, `ProvenanceFlags.ts:80` — both contract-bound, CI-gated;
  `ContextDerivedStudyEnvelope.ts` header documents why members must not be added or collapsed).
  The reference row is a floor, not a spec.
- **F4:** the reference's 5-value derivation enum vs the shipped 4-value + parse-time coherence
  refinements — a different partition with cross-checks the reference lacks; adopting it literally
  loses the AI_EXTRACTED/HUMAN_VALIDATED axis the tier lattice keys on.
- **E4:** the reference's normalising "Enum" collides with the FROZEN verbatim-mirror doctrine
  for `normativeForce` (`provenance.ts:159–167` — mirrored, never harmonised). Resolution: a
  DERIVED classification layered above the verbatim string, never replacing it.
- **A4:** "nominal, not a measurement" over-generalises — Madrid PGOUM keys on measured width
  (`madridAnchoDeCalle.ts:16–18`); as-built handles both with band-edge refusal. Reference should
  read "nominal-first, jurisdiction-declared".
- **C1:** the reference's four-value ordering enum is COARSER than the six shipped kinds —
  the selector must map many-kinds-to-one-legend, never flatten the kinds to four values.

Also noted: the reference's C6 rationale ("these force a solver architecture rather than a
fields-based schema") is consistent with the audit's kernel ruling ONLY in the 2.5D form the
audit fixed — K1's height-field, not 3D CSG. Nothing in the reference re-opens the constraint
graph, the third vocabulary seat, or kernel replacement; the do-not-build list survives intact.

## TOP-5 NEW-WORK ITEMS, RANKED

1. **C1 `orderingType` as an explicit typed selector** (zone/pack-level enum + kind-mapping) —
   small append-only schema change; converts A.7 step 4's generalisation claim from prose to
   checkable data, and is the missing eighth field of the irreducible core.
2. **D2 floor-area exclusion rule set** — the 10–15% sellable-area axis has zero machinery; it is
   the yield-layer sibling of `valueBasis` (a denominator/numerator-basis problem, exactly the
   defect family R2 already solved for D1's denominator).
3. **B4/E3 ordered overlay stack + declared conflict order** — upgrade the already-listed
   overlay-consumption wiring (IMPLEMENT-NOW #5 / audit P4) to an ORDERED list with
   rank-as-fact + refuse-on-tie; `ZoningRecord.overlays` stays producer-only until then.
4. **E5 declared trimming-policy label** — surface `farLimitedHeight.ts`'s implicit
   full-floors-ground-up policy as a typed, labelled product decision on the output (the one
   number that does not derive from an article, said so on the object).
5. **A3 per-edge frontage classification as a typed parcel attribute** (public-way / party /
   rear / open) — the foundation the L5 terraced route, E1 corner carry-around, and per-edge C5
   all queue behind; today it is emergent inside `blockRing.ts`/`blockDerivedDepth.ts` per-solver.

*(6th: E1 corner carry-around — registered, research-class until a pack demands it.)*
