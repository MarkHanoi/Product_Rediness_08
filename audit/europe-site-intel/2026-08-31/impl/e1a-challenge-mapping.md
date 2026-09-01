# E1a CHALLENGE — §6 European representation mapping (+ §2 spatial checklist)

> Lane: EUROPEAN REPRESENTATION MAPPER · 2026-09-01 · READ-ONLY review, no code changed.
> Authority: `../E1A-CHALLENGE-BRIEF.md` §6 (mapping), §2 (spatial checklist), feeding §2/§4.
> Subject read in full: `packages/schemas/src/siteintel/` — `entities.ts` (556 ln), `provenance.ts`,
> `confidence.ts`, `json.ts`, `index.ts`, `vocabularies/{dk,nl,lt}.ts` — plus
> `packages/schemas/__tests__/siteintel.test.ts` (507 ln). `ruleformat.ts` in the same directory is
> the STOPPED E1b draft (its own header says so) — read as signal only, no authority; likewise the
> uncommitted `packages/site-parcel-data/src/countryAdapters/ee/` E1d drafts.
> Evidence base: lane 2 (`lanes/germany-denmark-switzerland.md`, cited L2 §…), lane 3
> (`lanes/spain-france-portugal.md`, L3 §…), lane 4 (`lanes/netherlands-poland-lithuania-estonia.md`,
> L4 §…), REPORT §I/§J/§K/§L. Every verdict cites a lane line, a schema field, or a probed attribute;
> where the lanes lack the detail the row says NOT DECIDABLE and names the probe.

Chain columns per the brief: **source concept → SiteIntel entity → field → provenance →
applicability → rule representation → geometry representation.** Verdicts: **CLEAN** (maps without
distortion) · **CONTORTED** (representable only via convention/abuse of an open field) ·
**BREAK** (not representable without losing the probed semantics).

---

## 1 · DK — Plandata (L2 §DK-1/§DK-2, chains DK-A/DK-B)

| Probed source concept | Entity | Field | Provenance | Applicability | Rule repr. | Geometry | Verdict |
|---|---|---|---|---|---|---|---|
| `theme_pdk_lokalplan_vedtaget` (plan, lifecycle `_forslag/_vedtaget/_aflyst`) | SiteIntelPlan | `kind:"lokalplan"`, `status` mirrored open string | `source→Source(Plandata.dk)`; `doklink`→Document | — | — | `geometryRef` (⚠ dangling, see G-1) | CLEAN (status open-string mirroring is the documented design) |
| `_med_historik` versioned layers | SiteIntelVersion | `entityRef/validFrom/validTo/supersededBy` | adapter maps state history | — | — | — | CLEAN |
| `bebygpct=150` (ramme R24.B.3.40) | SiteIntelRule | `provenance.parameter:"bebygpct"`, `value:150`, `unit:"%"` | `source{DK, Plandata.dk, theme_pdk_kommuneplanramme, plan_id}` tier 1 DIRECT | `zoneRef`→ramme-as-Zone | scalar | via Zone geometry | CLEAN for the number alone |
| **`bebygpctaf=4` (denominator code — "the % of WHAT", L2 §DK-2)** | ??? | **no seat** | — | — | — | — | **BREAK.** The codelist is imported (`vocabularies/dk.ts`) but the Rule has NO field to carry the code. The model's own test rides it in `confidence.note` (`siteintel.test.ts:159` `note: 'bebygpctaf=4 — read the denominator code!'`) — a field `confidence.ts:90` declares **"never load-bearing for logic"**. Yet "denominator is data, never assumed" is entities.ts's OWN header invariant. Alternative: a second Rule `parameter:"bebygpctaf", value:4` — expressible, but nothing links it to the bebygpct rule (see G-4 companion-parameter gap). |
| `theme_pdk_byggefelt_vedtaget` (57,080 building fields; `maxbygnhjd/maxetager/eareal/boligenhed`, L2:174/185) | SiteIntelPrescription | `kind:"buildingField"` (in KNOWN_PRESCRIPTION_KINDS) | `source` | rules point at it — only via untyped `geometryRef` | tuple decomposes into N unlinked Rules; Prescription.`value` holds ONE scalar (entities.ts:242) | inline NativeCrsGeometry | CLEAN geometry / **CONTORTED** attribute tuple (G-1 + G-4) |
| `bygkunifelt` ("may build ONLY inside field") / `bygvejledende` (indicative vs binding) — L2:185-186 | ??? | **no seat** | — | — | — | — | **BREAK** for `bygvejledende`: no normative-force axis on Prescription or Rule (see G-3). `bygkunifelt` = exclusivity semantics; only expressible as an adapter-minted open `kind` token. |
| `lokalplandelomraade_vedtaget` (66,270 plan sub-areas; per-sub-area `eareal1..10`, L2:157/172) | SiteIntelZone (pseudo) | `typology.national` = delnr?? | `source.object_id` string | `zoneRef` | per-sub-area Rules | inline | **CONTORTED**: a delområde is a named sub-area carrying its own attribute set, not a zone typology; stuffing `delnr` into `typology.national` abuses a field defined as "National code, verbatim (13a, U_GC_P_F, WA…)". Workable, untyped. |
| Precedence ladder byggefelt → delområde → lokalplan → ramme → BR18 default (L2:180) | **nowhere in data** | — | — | — | — | — | **BREAK at the data layer, BY DESIGN**: REPORT §J assigns `precedence: ApplicabilityLadder` to adapter CODE. Consequence: the E1b declarative pack (`ruleformat.ts`) cannot carry the ladder — `inheritsFromZoneCode` covers zone inheritance (§DEC-2) only, not layer precedence. Flag for §3 (first-class Applicability question), do not fix in E1a. |
| `kompleks=true` (rules too complex to structure, 40 plans, L2 §DK-1) | Rule tier 6 + note, or document-kind RuleSource | — | — | — | — | — | CONTORTED-lite; an adapter representation choice, not a schema break. |

## 2 · DE — XPlanung (L2 §DE-1/§DE-2/§DE-7, chains DE-A/DE-B)

| Probed source concept | Entity | Field | Provenance | Applicability | Rule repr. | Geometry | Verdict |
|---|---|---|---|---|---|---|---|
| `bp_baugebietsteilflaeche_polygons` (MV, probed `grz=0.4, z=1`, L2:35) | SiteIntelZone | `typology.national` (e.g. "WA") | `source{DE, Land WFS, dataset}` | `zoneRef` | per-attribute Rules `parameter:"grz"/"z"` tier 1 DIRECT | inline | CLEAN — the flagship structured-DE case round-trips |
| `gfz`/`hoehenangabe` EMPTY on the probed feature (L2:370) | Rule `value:null` tier 6 | superRefine enforces null⇒tier 6 | — | — | — | — | CLEAN — UNKNOWN ≠ 0 is structural here |
| **`BauGrenze` vs `BauLinie`** (must-not-exceed boundary vs mandatory alignment; "the canonical model MUST carry them", L2:138) | SiteIntelPrescription | `kind:"buildingLine"` for BOTH?; distinction only in `typology{scheme:"XPlanung", code}` | `source` | rules reference via `geometryRef` (untyped) | — | inline | **CONTORTED**: the DATA distinction survives in `typology.code`, but the canonical kind vocabulary has one token (`buildingLine`) for two opposite semantics. An envelope engine must branch on NATIONAL codes — which breaks the SOURCE-AGNOSTIC principle (§7) at the semantic layer. Smallest fix: mint the boundary-vs-alignment distinction in the canonical `kind` vocabulary (the list is already open); no schema change. |
| `hoehenangabe` internal structure (height + reference point) | Rule | `parameter/value/unit` scalar | — | — | — | — | **NOT DECIDABLE FROM EVIDENCE** — lane 2 records only the field name and 0/162 fill; whether XPlanung's height carries reference-point/min-max structure the scalar Rule cannot hold needs a DescribeFeatureType/XSD probe (the xleitstelle test fixtures L2 §DE-3 names as CONSUME are the cheap probe). |
| BauNVO §17 **Orientierungswerte** — orientation values, NOT binding caps since 2017 (L2:64) | Rule (derivation DERIVED/class E) | — | — | — | — | — | **BREAK**: no bindingness axis (G-3). A tier-1-authoritative value that is legally NON-BINDING is indistinguishable from a cap; the six confidence tiers measure sourcing, not normative force. |
| §34 BauGB context-inference (no numeric source at all, L2 §DE-2) | Rule derivation `DERIVED` + tier 3, or CitedRefusal (C58, adopted) | — | — | `predicate` over context facts | — | — | CLEAN via the adopted C58 refusal vocabulary + DERIVED |
| PDF-bound numbers (Berlin/HH/NRW; `officialDocument` URL served) | Rule | `source{document, article, page}` | tier 4 `AI_EXTRACTED`, `valueLocation:"in-document-text"` | — | — | — | CLEAN — the BRIEF §11 DE example round-trips (`siteintel.test.ts` §2) |

## 3 · CH — ÖREB (L2 §CH-1/§CH-2, chains CH-A/CH-B)

| Probed source concept | Entity | Field | Provenance | Applicability | Rule repr. | Geometry | Verdict |
|---|---|---|---|---|---|---|---|
| Extract restriction: `TypeCode` + `Lawstatus` + theme (LU 10 restrictions, BS 17) | SiteIntelRestriction | `theme/typeCode/lawStatus` all mirrored open | `source` | — | — | inline geometry (LU inlines) | CLEAN — the entity is explicitly "modelled on the Swiss ÖREB extract" |
| Restriction → `LegalProvisions` → fedlex ELI / versioned-law API / ÖREBlex attachment PDFs (L2 §CH-1.1) | `legalProvisions[]`→SiteIntelDocument | Document `identity{scheme:"ELI",…}`, `url`, `version` | the §K chain shape | — | — | — | CLEAN — the restriction→legal-provision chain is the model's best-covered case |
| **BS variant: `Geometry: []` + `AreaShare`/`PartInPercent` + ReferenceWMS (L2:270/280)** | Restriction `geometry:null, areaShare:0.x` | refine allows areaShare alone | — | — | — | — | **BREAK on anchoring: `areaShare` is "affected share of THE PARCEL" (entities.ts:265) but `SiteIntelRestrictionSchema` has NO parcel reference field.** The ÖREB extract is parcel-scoped by construction (GetExtractById EGRID); once landed in the canonical store, "0.4 of which parcel?" is unanswerable. Smallest fix: one nullable `parcelRef` on Restriction (required exactly when areaShare is non-null). This is the sharpest single-field gap the mapping found. |
| `ch.BauStrassenWeglinien` ×11 — building/street LINES served as RESTRICTIONS (L2 §CH-1 BS probe) | Restriction (CH) vs Prescription (DE/FR carry the same concept) | theme open | — | — | — | — | **CONTORTED seam, not a break**: one real-world concept (building line) lands in two entities depending on the serving register. Queries like "all building lines binding this parcel" must span both. Acceptable if documented; do NOT merge the entities (the origin split is load-bearing — restraint clause). |
| Numeric rules NOT in extract; extract names the exact Reglement document (L2 §CH-1.3) | Rule tier 4 `AI_EXTRACTED`, `source.document` = the ÖREB-handed doc | — | — | — | — | — | CLEAN — document-kind RuleSource (§J) with the doc address served |
| Per-canton JSON wrapper variance (CH-1.4) | adapter concern | — | — | — | — | — | out of E1a scope, CLEAN by omission |

## 4 · FR — GPU/PLU (L3 §FR-1/§FR-2, chains FR-A/FR-B)

| Probed source concept | Entity | Field | Provenance | Applicability | Rule repr. | Geometry | Verdict |
|---|---|---|---|---|---|---|---|
| `zone-urba` `UG` + `idurba 75056_PLU_20260616` | SiteIntelZone + SiteIntelPlan + Document `identity{scheme:"idurba"}` | `typology.national:"UG"` | versioned doc identity free (§K) | `zoneRef` | règlement rules tier 4 per zone | inline | CLEAN |
| **`prescription-surf` "Hauteur plafond" typepsc 39-02, polygon probed, numeric value EMPTY at the probe point (L3:201)** | SiteIntelPrescription | `kind:"heightCeiling"`, `typology{scheme:"typepsc", code:"39-02"}`, `value:null` | `source` only | — | — | inline polygon | **CONTORTED**: `Prescription.value=null` (entities.ts:242) is ambiguous between "this kind has no scalar payload" and "the scalar exists but is unknown/pending" — and Prescription carries NO confidence object, so the UNKNOWN ≠ absence discipline that RuleProvenance enforces structurally does not reach the exact probed case (height-ceiling polygon, number pending per-document). The value-pending fact currently has nowhere honest to live. |
| CNIG `typepsc`/`stypepsc` national prescription typology (L3 §FR-2) | Prescription.typology | scheme+code | — | — | — | — | CLEAN — the typology object was built for this |
| Overlay stacking: 4 overlapping prescriptions at one point (L3 §FR-1 Paris 11e) | 4 Prescription rows | — | — | which wins/combines = precedence | — | — | geometry CLEAN; combination semantics **absent from data** (G-6, same as DK ladder) |
| Règlement numerics (hauteur/emprise/CES in PDF, addressable per zone) | Rule | `source{document:"75056_reglement_20260616.pdf", article, page}` tier 4 | — | `zoneRef` | — | — | CLEAN |
| `libelong` zone-doctrine prose (Lyon UCe1b) | no seat (Zone has no label/description field) | — | — | — | — | — | CONTORTED-lite: droppable or Document-carried; note only. |

## 5 · ES — Catastro + per-CA planning (L3 §ES-1/§ES-4/§ES-5)

| Probed source concept | Entity | Field | Provenance | Applicability | Rule repr. | Geometry | Verdict |
|---|---|---|---|---|---|---|---|
| `refcat` (+ foral cadastres outside DG Catastro) | SiteIntelParcel | `nationalId{scheme:"refcat"}`; foral = different `scheme` value | `source` per registry row | — | — | native CRS (EPSG:25830/25831 — the Madrid 4326 silent-zero trap is why `crs` travels with coordinates) | CLEAN — open scheme absorbs the per-CA cadastre seam |
| Madrid `VPLA_V_ORDENANZA`: NZ 1 grado 3º ("N1.3"), uso Residencial, `IT_ATICO "Si. Retranqueado 3m"` (L3 §ES-5 ES-B) | Zone `typology.national:"N1.3"` + Rules | rule-fragment-as-attribute: `parameter:"IT_ATICO"`, `value:"Si. Retranqueado 3m"` (string), tier 1, `valueLocation:"attribute"` | CLEAN carry | `zoneRef` | semantics deferred to E1b — honest at L0 | inline | CLEAN (carries verbatim without pretending to understand — correct L0 posture) |
| Per-CA heterogeneity (17 CAs: Madrid 70% populated ↔ Aragón 0-substituted ↔ Galicia mandated-not-served, L3 §ES-4) | Source registry + open strings + six tiers | e.g. Aragón 0-substituted values are exactly the UNKNOWN≠0 case → tier 6 | — | — | — | — | CLEAN — heterogeneity lands in adapters + confidence, as §7 demands; no schema change needed |
| SIU edificabilidad at SECTOR level (above parcel, L3 §ES-4) | Zone (a sector is a typed region of a plan) | — | — | `zoneRef` | — | inline | CLEAN |
| Existing GFA: DNPRC Σ`sfc` per-unit (161 units) + wfsBU OfficialArea 19,567 m² (L3 §ES-1.1/1.2) | SiteIntelDevelopmentPotential.existing + Building | `existing{gfaM2, source}` | SURVEYED ≠ NORMATIVE honoured (`BuildingHeightMethod`) | — | — | — | CLEAN at product granularity; the per-UNIT use-mix has no entity — correctly NOT modelled (no premature entities, brief restraint) |
| PGM Art. 242.4 exception ("inscriure una circumferència de vuit metres") | E1b RASE `exception` (draft) / Rule.body | — | — | `predicate` cannot express a geometric inscribability test | — | — | rule-representation limit, §1's JSON-Logic question — out of this section's scope but recorded: geometric predicates need pre-computed facts in the E1b fact vocabulary, or they are inexpressible. |

## 6 · NL — IMOW (L4 §NL-1, chains NL-A/NL-B)

| Probed source concept | Entity | Field | Provenance | Applicability | Rule repr. | Geometry | Verdict |
|---|---|---|---|---|---|---|---|
| `NormSpec {naam:"Bouwhoogte", type, eenheid, groep}` + `NormwaardeSpec.kwantitatieveWaarde` | SiteIntelRule | `parameter`, `value:number`, `unit` from Eenheid list (`vocabularies/nl.ts`, URI verbatim) | tier 1 DIRECT `valueLocation:"attribute"` | see locatieRefs row | scalar | — | CLEAN — the model was normalised FROM this shape |
| `kwalitatieveWaarde` (string norm value) | Rule `value:string` | — | — | — | — | — | CLEAN |
| `waardeInRegeltekst` | `valueLocation:"in-document-text"` (`nlNormwaardeValueLocation`, imported not invented) | — | — | — | — | — | CLEAN |
| **`locatieRefs` — norm values point at identifiable, reusable IMOW Locatie objects** | ??? | `applicability.geometryRef` is the intended seat — **but the model has no entity a geometryRef resolves to** | — | — | — | GIO geometries have no home | **BREAK (G-1)**: `RuleApplicabilitySchema.geometryRef` (entities.ts:308) is an opaque `SiteIntelId` with no named referent type; no geometry-bearing entity exists for an arbitrary IMOW Locatie (it is not a Zone — `typology.national` is a zone code, not a location id; not a Prescription — no typology code exists). The stopped E1d EE draft hit the identical wall and invented raw strings (`dp_hoonestus:<objectid>`, `eeRuleMapper.ts` geometryRef) — direct evidence the model chafes here in practice. |
| **IMOW activity+location typed rules (activiteit; `Toepasbare Regels` STTR; Verzoeksroutering by activity+location, L4 §NL-3)** | `applicability.predicate` JSON only | — | — | activity axis untyped | — | — | **CONTORTED (G-7)**: applicability has space (`geometryRef/zoneRef`), time (`valid_from/to`), condition (`predicate`) — but the ACTIVITY/intended-use axis, which NL types natively as first-class objects, must be encoded in an invented predicate fact vocabulary. This is the strongest external precedent for the brief-§3 first-class Applicability question. |
| Dual-regime IMRO `maatvoering` `{naam:"maximum bouwhoogte (m)", waarde:"24"}` + geometrie (L4 §NL-1b) | Prescription `kind:"heightCeiling", value:24` OR Zone+Rule | — | tier 1 | temporal merge via `valid_from/valid_to` | — | inline | CLEAN — Prescription fits maatvoering polygons exactly; the dual-regime merge is adapter logic (§J) over clean entities |

## 7 · LT — ASGR (L4 §LT-1/§LT-2, chains LT-A/LT-B)

| Probed source concept | Entity | Field | Provenance | Applicability | Rule repr. | Geometry | Verdict |
|---|---|---|---|---|---|---|---|
| `MAX_AUK_M 8.5` etc. (4 value families, `vocabularies/lt.ts` imported from the LEIP spec) | SiteIntelRule per field | `parameter:"MAX_AUK_M", value, unit:"m"` | tier 1 DIRECT | ASGR polygon → the G-1 referent problem again (polygon is neither Zone-with-typology… actually `FUNKC_ZON "U_GC_P_F"` IS a zone typology → Zone works) | scalar | inline on Zone | CLEAN — ASGR polygons carry `FUNKC_ZON`, so Zone + `zoneRef` is a faithful mapping |
| **Per-value provenance columns `*_TP/_NR/_D/_TPR` (source-doc id / number / approval date / planning kind)** | `_TP/_NR` → Document `identity`; `_D` → Plan.adoptedDate / rule `valid_from`; `_TPR` → Plan.`kind` | adapter mints one Plan+Document per distinct tuple; `source{plan_id, document}` points at them | — | — | — | — | CLEAN — the richest per-value provenance probed in Europe maps fully, PROVIDED the adapter mints Plan/Document records (the flat source-ref alone has no seat for `_TPR`; via the Plan entity it does). A worked LT fixture proving this tuple→entities mapping is the cheapest E1b-adjacent test to add. |
| **`PILN` completeness flag (P/N — consolidation may miss governing documents)** | ??? | **no load-bearing seat** — the model's own test carries it as `confidence: { tier: 1, note: 'PILN=P' }` (`siteintel.test.ts:201`) | — | — | — | — | **BREAK (G-2 note-overload)**: "authoritative but possibly incomplete consolidation" is neither a tier (sourcing is tier 1) nor representable in a non-load-bearing note. Same defect class as DK `bebygpctaf`. |
| ASGR is "rekomendacinio pobūdžio" (advisory consolidation; legal source = underlying TPD, L4:332) | ??? | no bindingness axis | — | — | — | — | **BREAK (G-3)** — third national instance of normative-force-without-a-seat |
| **`MAX_INTENS` unit UNRESOLVED (15/160 percent-vs-FAR, L4 §LT-1 caution)** | Rule `unit` | `unit:null` means "dimensionless" per `provenance.ts` doc — but here the unit is UNKNOWN, not absent | — | — | — | — | **CONTORTED (G-9)**: the model's own failure≠absence invariant, applied to `unit`, is violated — `null` conflates "dimensionless by nature" with "unit not yet resolved". `vocabularies/lt.ts` refusing to declare a unit is correct; the Rule field cannot express WHY. |
| `GALIOJA_NUO/IKI` validity on TPDR layers | `valid_from/valid_to` | — | — | — | — | — | CLEAN |

## 8 · EE — detailed plans / ehitusõigus (L4 §EE-1/§EE-4)

| Probed source concept | Entity | Field | Provenance | Applicability | Rule repr. | Geometry | Verdict |
|---|---|---|---|---|---|---|---|
| `dp_hoonestus` numeric columns (`tihedus 2.1 · protsent 61 · korgus 17.4 · sbp 3500 · arv 1`) | per-attribute SiteIntelRule | REPORT §I worked example — round-trips verbatim in the test | tier 1 DIRECT, `valueLocation:"attribute"` | hoonestusala = the drawn building area, NOT the parcel → the rules apply to a Prescription-shaped object (`kind:"buildingField"`, EE typology `{scheme:"PLANK", code:"hoonestusala"}` — the test's own §5 fixture does exactly this) | scalar | inline | CLEAN entities exist — **but the reference from Rule→that Prescription is only an untyped `geometryRef` (G-1); the stopped E1d draft bypassed the Prescription entity entirely and minted raw strings** |
| `korgus "0"` / empty = UNKNOWN, never no-limit (L4 EE-4) | Rule `value:null` tier 6 | superRefine makes the wrong encoding unrepresentable | — | — | — | — | CLEAN — this invariant is the model's best moment; the E1d draft's `parseEeEhitusoigusNumber` maps ""/​"0"→null+tier 6 exactly as designed |
| `tingimus` prose conditions (balcony rule) | Rule `value:string`, `valueLocation:"in-document-text"` | tier 1 carry, interpretation deferred | — | — | — | — | CLEAN (the NL/EE three-way split is imported, not invented) |
| ehitusõigus as a TUPLE (use, count, area, height, depth — PlanS defines it as one legal object) | N unlinked Rules | — | — | — | — | — | **CONTORTED (G-4)**: the legal unit is the tuple; the model stores 5–14 sibling rules with no grouping. "Show me this plot's ehitusõigus" = reassembly by convention (shared geometryRef prefix in the draft). |
| `korgusabs 32.64` (EH2000 absolute datum) | Rule `parameter:"maxHeightAbsolute", unit:"m"` | datum semantics in parameter name/note only; `SiteIntelTerrainSchema.datum` mints only `ELLIPSOIDAL` | — | — | — | — | CONTORTED-lite: a NORMATIVE height's vertical datum has no typed seat. Low frequency; note, don't fix. |
| `dp_krunt` planned PLOTS (a dp draws plots that need not match current cadastral parcels) | ??? | SiteIntelParcel is the CADASTRAL record; a planned plot is neither Parcel nor Zone | — | rules per krunt | — | — | **CONTORTED**: the planned-plot concept has no honest entity; today it must masquerade as Zone/Prescription. Same missing-referent family as G-1 — one "planning object the rule hangs off" answer would cover krunt, hoonestusala, delområde, and IMOW Locatie together. |
| `dp_kehtiv=0` = "no plan IN PLANK" ≠ "no plan" (L4 EE-1 regime note) | FetchOutcome (adopted C58-side authority, non-rivalry register) | — | — | — | — | — | CLEAN by explicit adoption — failure ≠ absence stays at the fetch layer |

---

## 9 · Brief §2 spatial checklist — 12 applicability shapes vs the model

| # | Shape | Verdict | Carrier / missing piece |
|---|---|---|---|
| 1 | entire parcel | **CONTORTED** | No `parcelRef` leg on `RuleApplicabilitySchema` (entities.ts:306-315: geometryRef/zoneRef/predicate only). Convention: point `geometryRef` at the Parcel id (untyped) or encode a parcel-id predicate. |
| 2 | a zone | **EXPRESSIBLE** | `applicability.zoneRef` → SiteIntelZone. Clean. |
| 3 | sub-area of a parcel / plan (DK delområde) | **CONTORTED** | No entity for a named sub-area; pseudo-Zone with delnr abused into `typology.national`, referenced by `zoneRef`. |
| 4 | building field (DK byggefelt, EE hoonestusala) | **EXPRESSIBLE** (geometry) / **CONTORTED** (linkage) | `Prescription kind:"buildingField"` exists; Rule→Prescription only via untyped `geometryRef`; the field's attribute tuple shatters into unlinked rules. |
| 5 | building line (DE Baugrenze/Baulinie, CH Baulinien) | **EXPRESSIBLE** (geometry) / **CONTORTED** (semantics) | One `kind:"buildingLine"` token for boundary-vs-mandatory-alignment; distinction survives only in national `typology.code`; CH serves the same concept as Restriction. |
| 6 | a frontage | **CONTORTED** | Open Prescription `kind` can be minted (no canonical token, no frontage semantics); no lane probed a served frontage object — partially NOT DECIDABLE whether more is needed. |
| 7 | a setback distance | **EXPRESSIBLE** | `Prescription{kind:"setback", value:metres, geometry}`; caveat: "measured from WHAT" lives only in `typology.code` (Murcia road-axis-vs-alignment lesson, memory `murcia-pgou-ejes-is-road-axis`). |
| 8 | a particular geometry | **CONTORTED, borderline INEXPRESSIBLE as typed data** | `geometryRef` names NOTHING resolvable — no geometry-bearing referent entity is defined for it, and applicability carries no inline geometry. The single hole most systems hit (NL locatieRefs, EE draft's invented strings, Plan.geometryRef equally dangling at entities.ts:193). |
| 9 | an overlay (FR prescription-surf, NL gebiedsaanduiding) | **EXPRESSIBLE** (the overlay itself) / **INEXPRESSIBLE** (its precedence) | Prescription/Restriction hold overlay geometry+typology; which layer WINS is adapter code (§J), absent from data. |
| 10 | a portion of a parcel (CH areaShare) | **CONTORTED → BREAK** | Restriction.areaShare exists but is unanchored (no parcelRef, entities.ts:261-271); as a Rule applicability, same as #8. |
| 11 | a particular intended use / activity | **CONTORTED** | Only `predicate` JSON over an undefined fact vocabulary; NL IMOW types activity+location natively — the model leaves the axis untyped. |
| 12 | a particular date/version | **EXPRESSIBLE** | `valid_from/valid_to` (Rule + Plan), `SiteIntelVersion`, `Scenario.asOfDate`; state-served history (DK `_med_historik`, LT `GALIOJA_NUO/IKI`, PL `wersjaId`) maps directly. Cleanest axis in the model. |

Score: 4 EXPRESSIBLE · 7 CONTORTED · 1 with a BREAK component (and #9's precedence half inexpressible).

---

## 10 · Cross-cutting gaps (ranked, deduplicated)

- **G-1 · The dangling geometry referent (highest leverage).** `Rule.applicability.geometryRef` and `Plan.geometryRef` are opaque ids with no defined referent entity; no addressable geometry object exists in the 17. Hit by: NL `locatieRefs`, EE hoonestusala/krunt (E1d draft invented `dp_hoonestus:<objectid>` strings — `eeRuleMapper.ts`), DK byggefelt/delområde linkage, FR prescription linkage, checklist #1/#3/#8/#10. **Smallest addition consistent with the restraint clauses: NOT a new entity — a normative statement (doc + E1b resolver contract) that `geometryRef` resolves to the id of any geometry-bearing SiteIntel entity (Zone | Prescription | Restriction | Parcel), plus canonical Prescription kinds for the sub-area/planned-plot cases.** Only if E1b then demonstrates a real IMOW Locatie that fits none of the four does a `PlanningObject`/`Locatie` entity become justified — do not mint it now.
- **G-2 · Note-overload: three probed LOAD-BEARING flags ride in a field declared "never load-bearing for logic"** (`confidence.ts:90`): DK `bebygpctaf` (`siteintel.test.ts:159`), LT `PILN` (`:201`), EE korgus caveat (worked example). The DK case is the worst — the model imports the denominator codelist and then gives the Rule no field to carry the code, violating its own header invariant "denominator is data, never assumed". Companion-parameter rules (a second Rule `parameter:"bebygpctaf"`) are the honest workaround today but are unlinked (G-4).
- **G-3 · No normative-force / bindingness axis.** Probed in four systems: DE Orientierungswerte (L2:64), DK `bygvejledende` (L2:186), LT "rekomendacinio pobūdžio" (L4:332), CH `Lawstatus` (present on Restriction only — Rule and Prescription have nothing). Confidence tier measures SOURCING, not legal force; a tier-1 indicative value is indistinguishable from a tier-1 cap. This is a §3-scale conceptual decision (binding | indicative | orientation | advisory-consolidation), not an E1a patch.
- **G-4 · No rule grouping / companion-parameter linkage.** The legal unit is often a tuple (EE ehitusõigus, DK byggefelt attribute set, DK bebygpct+af); the model stores unlinked single-parameter rules; reassembly is by naming convention.
- **G-5 · Restriction is unanchored** — `areaShare` without a parcel reference (entities.ts:261-271; CH BS probe L2:270/280). One nullable `parcelRef` field settles it; flagged as the single sharpest field-level gap.
- **G-6 · Precedence/hierarchy is code, not data** (DK 4-layer ladder L2:180; FR overlay stacking; BR18/BauNVO statutory defaults). By REPORT §J design — but it caps how much of a country can migrate into the E1b declarative pack (`ruleformat.ts` covers zone inheritance only). Belongs to the brief-§3 Applicability decision.
- **G-7 · Activity/use axis untyped** — NL IMOW's first-class activity+location vs `predicate` JSON with an undefined fact vocabulary (checklist #11).
- **G-8 · Prescription lacks the honesty machinery Rules have** — `value:null` ambiguity + no confidence object, probed live by FR "Hauteur plafond" with empty numeric (L3:201/278).
- **G-9 · `unit:null` conflates dimensionless with unknown** — LT MAX_INTENS (L4 §LT-1). The model's own UNKNOWN≠absence doctrine, unapplied to one field.
- **G-10 (minor) · Zone/Prescription/Restriction carry no `version` field** while Parcel/Building/Road/Plan/Regulation do; versioning them requires an inbound-only `SiteIntelVersion` row (representable, non-navigable). DK `_med_historik` versions zone-level layers; FR re-consolidations re-cut zones.

## 11 · Clean mappings (terse)

- The **per-rule provenance record** round-trips all four probed provenance regimes verbatim: EE attribute (tier 1), DE PDF w/ document/article/page (tier 4), DK ramme value, LT ASGR value — test §§1–3.
- **UNKNOWN ≠ 0 ≠ no-limit is structural** (value=null ⇔ tier 6; delta-null propagation) and matches the probed EE korgus=0 and ES Aragón 0-substitution cases exactly.
- **NL three-way value split** (kwantitatief/kwalitatief/in-regeltekst) → `value:number|string` + `valueLocation` — imported, not invented.
- **CH restriction→legal-provision→document chain** — Restriction/Document/Evidence mirror the ÖREB extract, the model's stated template.
- **LT per-value provenance columns** map fully once the adapter mints Plan+Document per `(_TP,_NR,_D,_TPR)` tuple.
- **Temporal axis** (valid_from/valid_to, Version, Scenario.asOfDate) covers every state-served history mechanism the lanes probed.
- **Native-CRS geometry with the CRS on the coordinates** honours the Madrid-4326, PL-2180, EE-3301, LT-3346 traps by construction.
- **Open strings for Plan.kind/status, Zone typology, Prescription/Restriction kinds, id schemes** absorb per-country and per-CA heterogeneity without schema churn — the §7 SMALL/SOURCE-AGNOSTIC principle holding in practice.
- **Non-rivalry adoption** (FetchOutcome for failure≠absence, C58 refusals, LandBasis) keeps E1a from re-minting solved concepts.

## 12 · NOT DECIDABLE FROM EVIDENCE (probe register)

1. **DE `hoehenangabe` internal structure** (reference-point/min-max vs scalar) — lane 2 records the field name and 0/162 fill only. Probe: XPlanGML XSD / xleitstelle fixtures (L2 §DE-3 already marks them CONSUME).
2. **FR "Hauteur plafond" numeric carriage** — whether the number appears in `txt`/label on other documents or only in the règlement (L3 §FR-1 says "probe per document"). Probe: prescription-surf sweep across ≥3 PLUs.
3. **NL IMOW Activiteit shape in DATA** (whether the activity axis demands more than a predicate) — data endpoints were 401-gated at probe time (L4 §NL-1a); schema-level only. Probe: keyed `_zoek` + regeltekstannotaties pulls after the free DSO key lands.
4. **DK delområde/byggefelt full attribute schemas** — lane 2 transcribes byggefelt's headline fields and the `eareal1..10` groups but not complete DescribeFeatureType output; whether more tuple structure chafes G-4 harder needs that probe.
5. **LT MAX_INTENS unit** — named unresolved by lane 4 itself; probe: ASGR methodology document, before any GFA computation.
6. **ES Madrid restriction layers** — L3 §ES-5 ES-B marks restrictions UNKNOWN (not probed); Restriction-entity fit for catálogo/protecciones undecided.
7. **Frontage as a served object** — no lane probed one; whether checklist #6 needs a canonical concept is open until a real frontage prescription is in evidence.

## 13 · Restraint compliance (what this mapping does NOT propose)

Per the brief's clauses: no new entity is proposed (G-1's fix is documentation + kind vocabulary; a Locatie/PlanningObject entity is named only as the E1b-conditional escalation) · no dimension collapse (bindingness G-3 must NOT be folded into confidence tiers; the Prescription/Restriction origin split stays) · no invented country detail (every row above cites its lane line or schema field; unresolved rows are in §12) · the only single-field additions surfaced as candidates are `Restriction.parcelRef` (G-5) and a load-bearing seat for companion codes (G-2), both awaiting the founder's §3 Applicability decision rather than piecemeal patching.
