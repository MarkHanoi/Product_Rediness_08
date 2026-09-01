# E1a CHALLENGE — MODEL ARCHITECT findings (brief §1, §3, §4, §5, §7)

> Review lane of `E1A-CHALLENGE-BRIEF.md` (2026-09-01). READ-ONLY: no code, schema or test was
> changed. Subject: `packages/schemas/src/siteintel/` (8 model files + 3 vocabularies) and
> `packages/schemas/__tests__/siteintel.test.ts` — all read in full. Evidence base: lane files
> under `audit/europe-site-intel/2026-08-31/lanes/` (cited below as L1/L2/L3/L4/L7 §…),
> REPORT.md §I/§J/§K/§L/§R. The STOPPED, UNCOMMITTED E1bc/E1d drafts
> (`packages/schemas/src/siteintel/ruleformat.ts` is the E1b schema seat;
> `packages/site-parcel-data/src/countryAdapters/ee/` is the E1d EE adapter draft) were read as
> chafe-signal only — they carry no authority, but they are the only existing record of the model
> being USED, and three of the findings below were demonstrated by them, not hypothesised.

Verdict shorthand used below: **CLEAN** (probed construct maps with no loss) · **GAP** (probed
construct demonstrably cannot be carried in the typed fields) · **NOT DECIDABLE** (the lanes lack
the detail; the settling probe is named).

---

## §1 — JSON-Logic: carrier, not ontology

### 1.1 How `Rule.body` is actually typed

`Rule.body` is `JsonValueSchema.nullable()` (`entities.ts` `SiteIntelRuleSchema`), where
`JsonValueSchema` (`json.ts`) is a pure recursive JSON value. Nothing at schema level names
JSON-Logic: the coupling exists only in doc comments ("Scalar/conditional expression…",
"JSON-Logic predicate over parcel/context facts (evaluated by E1b)" — `entities.ts:310`). The
canonical semantics of a rule — parameter, value, unit, source address, derivation, confidence,
validity — live in TYPED envelope fields (`RuleProvenanceSchema`, `provenance.ts`), not in the
body. The stopped E1b seat (`ruleformat.ts`) keeps the same split: envelope composed whole,
bodies carried as opaque `JsonValue`, "the typed deterministic evaluator lives at L2 … an
EXPRESSION format is 'never sufficient alone', REPORT §L".

The stopped E1d draft used the model on a real country and set `body: null` on **every** rule it
emitted (`eeRuleMapper.ts` — all EE ehitusõigus attributes are bare scalars). So in the only real
usage so far, JSON-Logic carried nothing at all.

**Verdict: the brief's desired end-state — canonical Rule semantics independent of any execution
representation — is ALREADY the implemented design.** JSON-Logic is not the canonical ontology
today; the risk is drift, not the current state.

### 1.2 The four external requirements, against the lane evidence

| Framework | Requirement it creates | Round-trips through E1a? | Evidence |
|---|---|---|---|
| **BCRL** | none adoptable — "NO public BCRL spec/engine repo … research artefact" | nothing exists to round-trip | L1 §E.2, §G.1 |
| **RDF/SHACL** | QA-only ("SHACL-style shape validation of the evidence graph … never the applicability engine") | no requirement on `Rule.body` | L1 §G.2; REPORT §K.5 |
| **XPlanung** | attribute-shaped rules (GRZ/GFZ/Z/hoehenangabe) + geometric objects (BauGrenze/BauLinie) — no expression language exists to carry | **CLEAN**: scalars → rule envelope; lines/fields → `SiteIntelPrescription` ("map 1:1 onto PRYZM's Prescription model", L2 DE-7) | L2 §DE-1/§DE-7 |
| **IMOW/STOP-TPOD** | typed norm values (`kwantitatieveWaarde` / `kwalitatieveWaarde` / `waardeInRegeltekst`), unit value-lists, `locatieRefs` — no expression language in the norm objects | **CLEAN** for value/unit/location-split (`value` union, `unit`, `valueLocation`, `vocabularies/nl.ts`); `locatieRefs` hits the dangling-referent gap of §3.3 below | L4 §NL-1a (openapi v8.5.2, probed) |

**No DEMONSTRATED incompatibility** — no lane probed a real construct that JSON-Logic-as-carrier
loses, because the two structured-rule standards that exist (XPlanung, IMOW) are
attribute-shaped, not expression-shaped, and the two rule languages (BCRL, SHACL) were rejected
on independent grounds.

### 1.3 The one demonstrated LIMIT, and where it will bite (E1b, not E1a)

Geometric constructions cannot be JSON-Logic — L1 §G.3 verbatim: "no units, no quantifiers, no
geometry"; L1 §G.5's parallel finding for OpenFisca: "a parcel-envelope rule (block-derived
depth, height planes) cannot be expressed". The model's own files already carry the two probed
instances:

- PGM Art. 242.4 "sempre que sigui possible inscriure una circumferència de vuit metres de
  diàmetre" — cited in `ruleformat.ts`'s RASE `exception` doc as text that must be CARRIED even
  when it cannot be checked.
- `ruleformat.ts` `constructions[]` — "per-parcel CONSTRUCTED parameters (JSON-Logic bodies over
  parcel/street facts)" — works only because the geometric operator (street-width construction,
  block depth) computes a NAMED FACT outside the rule, and the JSON-Logic body merely selects
  and arithmetises over it.

That split (JSON-Logic strictly over named facts; geometric operators as named engine
capabilities) is correct and matches REPORT §L. The exposure: `body` has **no format/dialect
discriminator**, so a future operator-reference body would be indistinguishable from a JSON-Logic
body, and JSON-Logic becomes canonical-by-convention — the exact drift §1 of the brief forbids.
**Conceptual extension (E1b-scoped, not now): a body carrier tag** (e.g. the body object names
its dialect) introduced when the Barcelona TS→data pilot migrates the first geometric
construction. No change to E1a before that pilot demonstrates the shape.

**NOT DECIDABLE FROM EVIDENCE:** whether NL STTR/DMN decision trees must round-trip through
`Rule.body` at all. STTR is "machine-EXECUTABLE rules, distinct from machine-READABLE norms"
(L4 §NL-3), and REPORT §L lists STTR under structured-rule ingestion — but no lane fetched an
actual toepasbare-regels tree. Settling probe: pull ONE STTR tree with the free DSO key (already
a week-1 action, REPORT §S.1) and attempt the mapping before E1b fixes the body contract.

---

## §3 — Applicability: "why does Rule X apply to Parcel Y"

### 3.1 The current machinery

`RuleApplicabilitySchema` (`entities.ts:306–315`): three nullable legs — `geometryRef`,
`zoneRef`, `predicate` — at least one required. Plus, elsewhere: `valid_from`/`valid_to` on every
rule's provenance; `SiteIntelVersion` (`entityRef/validFrom/validTo/supersededBy`);
`SiteIntelScenario.asOfDate`; `Prescription.zoneOrPlanRef`; `Zone.planId`;
`Regulation.planId` nullable "for plan-independent instruments (national law)".

### 3.2 Scorecard across the brief's ten dimensions

| Dimension | Verdict | Evidence |
|---|---|---|
| spatial (exact portion of a parcel) | **PARTIAL** — expressible only via an UNTYPED `geometryRef` (see 3.3) | EE ehitusõigus applies to the drawn hoonestusala, not the parcel (L4 §EE-1; PlanS semantics) |
| zoning | **CLEAN** — `zoneRef` | test mini-graph zone-ee-1 |
| plan hierarchy | **GAP** — see 3.4 | DK ladder: byggefelt → delområde → lokalplan → ramme → BR18 (L2 §DK-1) |
| overlays | **PARTIAL** — an overlay is a `Prescription`/`Restriction` with geometry, but a Rule cannot TYPE-reference one | FR: 4 overlapping prescription polygons at one Paris point, incl. "Hauteur plafond" typepsc 39-02 (L3 §FR-1:201) |
| intended use | **GAP** — see 3.5 | EE `dp_krunt` per-use-slot values (E1d draft); DK `anvgen`/`anvspec1..10` (L2 §DK-1); DE BauNVO per-Baugebiet table (L2 §DE-2) |
| temporal validity | **CLEAN** — `valid_from`/`valid_to` + `isInForceOn` + `Scenario.asOfDate` | OpenFisca pattern, REPORT §K.2 — but see the validity-BASIS gap, §4.3 |
| exceptions | **PARTIAL** — carried as RASE `exception` verbatim text (`ruleformat.ts`), never linked rule→rule | PGM Art. 242.4; no lane demonstrated a country SERVING machine-linked exceptions, so text-carry is honest for now |
| precedence | **GAP** — see 3.4 | L2 §DK-1: "a per-parcel resolver must check byggefelt → delområde → lokalplan → ramme, in that precedence order — this IS the Danish applicability ladder" |
| supersession | **CLEAN** — `Version.supersededBy` at entity level | DK `_med_historik` layers, PL `wersjaId`, LT `GALIOJA_NUO/IKI`, EE annual snapshots (REPORT §K.2) |
| municipal/regional/national hierarchy | **PARTIAL** — `Plan.kind`/`Regulation.planId=null` gesture at it; a national DEFAULT rule ("applies where no plan rule does" — DK BR18 §168-186, DE §34 BauGB) is expressible only as an opaque predicate | L2 §DK-1 ("Bygningsreglement … the statutory default — DERIVED, not MISSING"); L2 §DE-2 |

### 3.3 Demonstrated chafe #1 — dangling geometry referents

`geometryRef` (and `Plan.geometryRef`, `entities.ts:193`) is a bare `SiteIntelIdSchema` — ANY
non-empty string parses, and **none of the 17 entities is an addressable standalone geometry**.
The E1d draft did exactly what the type permits: it minted ad-hoc namespaced strings —
`` `dp_hoonestus:${objectid}` `` (`eeRuleMapper.ts:208`, `:303`) — that resolve to nothing in the
entity graph. The correct target EXISTED: an EE hoonestusala is precisely a
`SiteIntelPrescription` of kind `buildingField` (the test's own mini-graph builds one), and the
rule should have referenced it — but nothing in the model type-guides or even documents that.
NL will hit the identical seam: `NormwaardeSpec.locatieRefs → geometry` with identifiers like
`nl.imow-gm1911.normwaarde.20240101` (L4 §NL-1a:45) need a typed referent on our side.

The question "why does this rule apply HERE?" currently answers with an unresolvable string.
That defeats the model's own purpose ("this rule applies to this exact spatial portion of this
parcel BECAUSE OF this planning object" — brief §2).

### 3.4 Demonstrated chafe #2 — precedence and instrument rank have no seat

When the Nørrebro ramme says `bebygpct=150` and a lokalplan says `bebygpct=630` (both live-probed
values, L2 §DK-1), both rules "apply" to the parcel; which one BINDS is Danish layer-precedence
semantics. REPORT §J assigns `precedence: ApplicabilityLadder` to the ADAPTER, and PRYZM's
existing legal-attribution layer holds instrument-priority tables AS DATA — "built and wired to
nothing" (L7 §4). The canonical Rule record cannot state its own instrument level, so two
conflicting parsed rules are indistinguishable in the model and every consumer must re-import
country knowledge to rank them. The RESOLUTION algorithm rightly stays engine/adapter work; the
RANK of a rule is a fact about the rule and belongs in its record — exactly how the attribution
layer already treats it.

### 3.5 Demonstrated chafe #3 — no use-scope leg

The E1d draft had to encode "this roof-pitch value applies to use slot 2 of the plot's
'; '-joined use list" as an id suffix (`-slot2`) plus a FREE-TEXT NOTE
(`eeRuleMapper.ts:326–352`: "slot 2 of '; '-joined maxsoosak … per-use-slot encoding"). The
applicability object has no use dimension, and `confidence.note` is documented "never
load-bearing for logic" (`confidence.ts:90`) — so a real, probed, per-use conditionality is
machine-invisible. DK's `anvgen`/`anvspec1..10` codes and the DE BauNVO per-Baugebiet table are
the same dimension in two more countries.

### 3.6 Decision: is a first-class Applicability concept justified?

**YES — as a richer VALUE OBJECT on Rule, not as a new independently-identified entity.** No
audited country serves applicability as an addressable object (CH ÖREB computes the
restriction-per-parcel join server-side; everyone else serves geometry to intersect), so minting
an Applicability entity with its own id/lifecycle would be a premature entity. What is justified
is replacing the three untyped legs with a typed concept:

**Applicability (conceptual definition — no implementation until approved):**

- `basis[]` — the "because of this planning object" answer: typed references
  `{ kind: zone | prescription | plan | restriction | regulation, ref }` — the same shape
  `Evidence.from` already uses. Replaces `zoneRef` and the planning-object half of
  `geometryRef`. Closes 3.3.
- `geometry` — a `NativeCrsGeometry` (or ref to a basis object's geometry) for the residual case
  where the spatial scope is served as bare geometry with no planning object behind it.
- `useScope[]` — national use tokens, VERBATIM open strings (EE otstarve categories, DK anvgen
  codes, DE Baugebiet kinds). Never harmonised at L0 — same doctrine as `Zone.typology.national`.
  Closes 3.5.
- `rank` — `{ scheme, level }`: the rule's position in its country's instrument-precedence
  ladder, MIRRORED from national semantics (DK: byggefelt/delområde/lokalplan/ramme/BR18;
  the attribution layer's priority-table key as data). Closes 3.4. Resolution stays in the
  engine.
- `condition` — the predicate, unchanged (carrier-tagged per §1.3 when E1b lands).
- Temporal legs stay WHERE THEY ARE (`valid_from`/`valid_to` on provenance, `Version`,
  `Scenario.asOfDate`) — they are proven and moving them would be churn.

**Deferred by name (restraint clause):** `exceptedBy[]`/`displaces[]` rule-to-rule links — no
lane demonstrated any country SERVING machine-linked exceptions; RASE `exception` verbatim text
carries them honestly until an adapter demonstrably needs the machine link.

---

## §4 — Source vs Evidence

### 4.1 The current provenance machinery, walked against the eleven artefact kinds

Current shape: `RuleSourceRef` (country/authority/dataset/plan_id/object_id/document/article/
page) + `SiteIntelSource` (registry row: endpoint/protocol/licence/gate/probes) +
`SiteIntelDocument` (url/kind/identity{scheme,value}/version/retrievedDate) +
`SiteIntelEvidence` (claim/from{kind,ref}/method/checkedDate/hash) + RASE verbatim spans (E1b).

| Artefact kind (brief §4) | Carried by | Verdict |
|---|---|---|
| GIS feature attribute | `source.dataset` + `source.object_id` (+ LT `*_TP/_NR/_D/_TPR` columns mapped by adapter) | **CLEAN** — the EE/DK/LT worked chains in the test do exactly this |
| WFS response | `Evidence.method` ("live WFS probe") + `checkedDate` + `hash`; service identity via `Source.endpoint` | **CLEAN** |
| API response | same | **CLEAN** (NL Ozon, L4 §NL-1a) |
| PDF page | `source.page` (1-based int) + `source.document` | **CLEAN** (DE test fixture: page 12) |
| article | `source.article` open string ("§ 4 (2)") | **CLEAN** |
| paragraph | absorbed by `article` as an open string | **CLEAN** (adequate) |
| table | no locator; `article` prose can name it | **DEFERRABLE** — see 4.4 |
| map geometry | **GAP** — see 4.2 | FR prescription polygon, CH restriction geometry, DK byggefelt |
| scanned document | `Document.kind` open; no in-scan anchor | **DEFERRABLE** — C23 `ExtractionProvenance` (crop, dual-pass) is the named external authority |
| extracted text | RASE verbatim spans (E1b `RaseAnnotationSchema`) — no character offsets | **DEFERRABLE** — see 4.4 |
| human validation | `derivation: HUMAN_VALIDATED` + tier-5-only-on-recorded-event guard (`confidence.ts` header) + the C58 `humanVerifiedBy` event outside | **CLEAN** (two-record encoding, authorities named) |

The Source/Evidence/Document three-way split itself is CONFIRMED by the audit's best evidence
chain: it is isomorphic to what CH ÖREB actually serves — restriction → typed code → law status
→ exact legal document with versioned-law URLs (L2 §CH-1, "MODEL its evidence chain on it").
FR's versioned document identity (`idurba 75056_PLU_20260616`, L3 §FR-2) drops verbatim into
`Document.identity{scheme:'idurba', value}` + `Document.version`. These are clean mappings, and
they are the two countries the audit called best-in-class for evidence.

### 4.2 Needed NOW: Evidence must be able to point at a planning object

`EvidenceRefKindSchema` is `source | document | rule | derivation` (`entities.ts`). A claim
whose support is a DRAWN GEOMETRY — "buildable here because this byggefelt polygon covers it"
(DK, 57,080 features, L2 §DK-1), "height-capped because this Hauteur-plafond polygon overlaps"
(FR, L3 §FR-1:201), "restricted because this Baulinie crosses the parcel" (CH BS ×11, L2 §CH-1)
— cannot name its evidence: `prescription`/`zone`/`restriction`/`plan` are not legal ref kinds.
Every one of the 20 §R chains has geometric evidence in its restriction/zone steps, so the
evidence graph will hit this on chain #1, not in some future country. **Smallest addition
(conceptual): extend the Evidence ref-kind vocabulary with the geometric planning entities** —
one enum, no new entity, no new fields.

### 4.3 Needed NOW: the validity-basis of a date must be data, not a note

REPORT §K.2: where the state serves no machine validity axis, "the graph records ingestion
versions". The model has no field distinguishing a LEGAL `valid_from` (EE `kehtestkp`, DK
`datoikraft`) from an INGESTION `valid_from` — so the E1d draft, forced to choose, wrote the
fetch date into `valid_from` and apologised in `confidence.note`
(`eeRuleMapper.ts:141`: "valid_from is the FETCH date … never read this as the legal adoption
date"), and `ruleformat.ts` pushed the same fact into document-level free-text `notes[]`. A
point-in-time query (`isInForceOn`) cannot see either apology: it will happily answer "what
applied on 2025-01-01" from a date that is not a legal fact. This is the same defect class as
the DK denominator (§5.3): a load-bearing semantic in a non-load-bearing channel. **Smallest
addition (conceptual): a typed validity-basis flag (legal | ingestion) beside
`valid_from`/`valid_to`.**

### 4.4 Deferrable, with the trigger named

- **Text spans with offsets** — RASE verbatim spans + C23 extraction audit cover human review;
  no lane demonstrated offset-grade need. Trigger: the document-rule extraction pipeline (E-wave
  for DE/CH/FR) emitting canonical records.
- **Table/row locators** — `article` open string absorbs "Art. 242 table"; trigger: the
  Barcelona TS→data pilot, whose citations are prose `ordinanceRef` today.
- **Per-request URL on Evidence** — `Source.endpoint` + `method` prose suffice; trigger: a
  dispute that hash+date cannot settle.
- **Time-of-day precision** — `IsoDateStringSchema` is date-only, so same-day re-fetches share a
  `checkedDate`; the `hash` disambiguates content. Trigger: an adapter that re-fetches
  intra-day and needs ordering.
- **Rule→Evidence edge** — `Rule` carries no `evidenceRefs`; chains hang off
  `Envelope.derivationTrace[]` and E1c "wires chains through the existing attribution layer"
  (`entities.ts` Evidence doc). Where the edge lives is E1c's call; if it lands on Rule it is
  additive, so deferring costs nothing now.

---

## §5 — Confidence: the six tiers against the six worked examples

### 5.1 The examples, one by one

Axes actually present in a record today: **tier** (1–6) · **derivation**
(DIRECT/DERIVED/AI_EXTRACTED/HUMAN_VALIDATED) · **valueLocation** (attribute/in-document-text) ·
source authority (implicit in `RuleSourceRef`/`Source`) · free-text `note`. So the brief's fear
of ONE collapsed dimension is not the implemented state — derivation and location are already
separate fields. The question is whether the tier enum conflates pairs the countries hit.

1. **Authoritative machine-readable, deterministically transformed** (DK GFA = bebygpct × the
   CODED denominator area, L2 §DK-2): tier 3 + derivation DERIVED; input tiers recoverable via
   the evidence chain. **CLEAN** — modulo the denominator gap below (5.3), which is a value-
   semantics gap, not a confidence gap.
2. **Authoritative PDF value, AI-extracted** (DE Textteil § 4(2) — the model's own test
   fixture): tier 2 (authoritative-document-derived) and tier 4 (ai-interpretation) are BOTH
   true — they sit on different axes (source-kind vs extraction-method). The fixture chose 4.
   **CONFLATED PAIR, hit constantly**: 50% of the §R numeric-rule steps are document-bound
   (DE/CH/FR/PT/ES), so every extracted number faces this choice. Mitigation exists in-record:
   tier 2's information is recoverable from `source.document ≠ null` + `valueLocation:
   in-document-text`, and tier 4's from `derivation: AI_EXTRACTED`. **The tier is a REDUNDANT
   PROJECTION of the other axes.** Recommendation (conceptual): define the projection as a
   FUNCTION (tier derivable from derivation × valueLocation × source-kind × validation-event ×
   known-unknown), document it, and refine-reject incoherent pairs (e.g. tier 1 +
   AI_EXTRACTED). Do NOT add a seventh tier and do NOT collapse to a score.
3. **AI interpretation subsequently human-validated**: tier 4→5, derivation
   AI_EXTRACTED→HUMAN_VALIDATED; the AI history survives in C23 `ExtractionProvenance`
   (named non-rival authority) and/or a second Evidence node (method "human validation").
   Tier 5 upgrades only on a RECORDED event (`confidence.ts` header, mirroring C58 L-449).
   **CLEAN as a two-record encoding** — acceptable under C84 EI-9; the canonical record alone
   does not tell you it was AI-born, which is tolerable because the evidence chain must be
   walkable anyway.
4. **Deterministic inference from authoritative geometry** (street width CONSTRUCTED — the
   `SiteIntelRoad` doc comment's own example; DE §34 neighbourhood inference, L2 §DE-2):
   tier 3 + DERIVED + Evidence `from.kind: 'derivation'`. **CLEAN.**
5. **Authoritative but ambiguous rule**: **GAP — no tier fits.** Value present and
   authoritative (tiers 1–2 claim clean interpretability), not missing (tier 6 denies the value
   exists). The live case is already in the tree: LT `MAX_INTENS = 15/160` — value served,
   authority national, UNIT SEMANTICS UNRESOLVED ("percent-like encoding? … do not guess",
   L4 §LT-1; `vocabularies/lt.ts` deliberately declares no unit). The model's own test encodes
   the caveat as a bare tier-6 `Confidence` with a note — but a real rule row would carry
   value 160 at tier 6 (parseable: the superRefine only forbids NULL at tier ≠ 6), which
   mislabels an authoritative served number as "uncertain-missing". DE BauNVO
   Orientierungswerte ("orientation values, not binding" since 2017, L2 §DE-2) is the same
   shape from the bindingness side. **Two countries hit it in practice.**
6. **Genuinely unknown**: tier 6 + value null, ENFORCED by superRefine (`value=null only at
   tier 6`), proven against the live EE `korgus="0"` sibling feature (L4 §EE-1; E1d
   `parseEeEhitusoigusNumber`). **CLEAN — this is the model's best-proven invariant.**

### 5.2 Should the axes stay separate? — YES, and one axis is missing

Authority (who published), derivation (how the value was obtained), AI-vs-not (a derivation
value), human validation (an EVENT, recorded outside per C58), and uncertainty (tier 6 +
null-guard) are all representable and mostly already separate. **The missing axis is SEMANTIC
UNCERTAINTY / NORMATIVE FORCE on a present value**, demonstrated three times by probed
attributes:

- LT ASGR is "rekomendacinio pobūdžio" — recommendation-grade consolidation; the legal source is
  the underlying TPD (L4:332). A tier-1 DIRECT ASGR rule is authoritative-machine-readable AND
  not the binding instrument.
- DK byggefelt `bygvejledende` — indicative-vs-binding as a served field (L2:186).
- DE BauNVO §17 — Orientierungswerte, class "E (DERIVABLE with stated uncertainty), never
  DIRECT" (L2 §DE-2).

`Restriction.lawStatus` exists precisely because ÖREB serves it; `Rule` has no analogue.
**Conceptual extension: a mirrored, open-string normative-force/lawStatus field on the rule
record** (same "mirror the register, never invent a harmonisation" doctrine as `Plan.status`).
This also gives worked-example 5 its honest encoding: value present, authority stated, force or
interpretation flagged — without touching the six tiers.

### 5.3 The demonstrated leak that must be fixed BEFORE E1b freezes records

The DK worked chain — the model's OWN test — carries the denominator in `confidence.note`:
`{ tier: 1, note: 'bebygpctaf=4 — read the denominator code!' }`
(`__tests__/siteintel.test.ts:159`). Three facts collide:

- `confidence.ts:90` declares `note` "never load-bearing for logic";
- `provenance.ts:125` declares codelist values "travel as their codelist type, not here" — i.e.
  NOT in `value` — leaving the denominator NO typed seat anywhere in the rule record;
- `entities.ts` header invariant: "denominator is data, never assumed" (L2 DK-2), and the live
  consequence is quantified: Aarhus `bebygpct=180, af=1` — "a naive per-parcel 180% GFA would be
  WRONG" (L2 §DK-2).

So a consumer reading only typed fields reproduces exactly the C63 trap the invariant exists to
kill. The same "scalar value + unit is not a complete semantic" family has two more probed
members: EE `korgusabs 32.64` is metres **in the EH2000 vertical datum** (L4 §EE-1) — the datum
rides in the parameter name/note; LT `MAX_INTENS` percent-vs-ratio (5.1.5 above). **Smallest
conceptual addition: ONE optional typed value-basis/qualifier on the rule provenance record**
`{ scheme, code }` (e.g. `{scheme:'dk-bygberegnaf', code:'4'}`, `{scheme:'ee-vertical-datum',
code:'EH2000'}`), mapped to `LandBasis`/datum semantics in ADAPTERS — minting no mapping table
at L0 (the L-664 restraint the DK vocabulary file already honours). This is a REVISE-class item:
records written without it must be re-emitted once it exists, so it should precede bulk E1b/E1d
emission.

---

## §7 — The seven principles, scored

| Principle | Verdict | One sentence |
|---|---|---|
| **SMALL** | **PASS** | 17 entities + 3 imported wire vocabularies, no country enums, open strings wherever a national lifecycle/typology varies ("a closed enum here would be an invented harmonisation of 30 national lifecycles"), and the refused-by-name list in `impl/E1a-canonical-schemas.md` shows restraint was active, not accidental. |
| **SEMANTIC** | **PASS with a watch item** | No country schema is copied — but `parameter` is an ungoverned open string and the fixtures already spell the same concept three ways (`maxHeight` / `maximum_height` / `bebygpct`), so cross-country comparability rests entirely on the §J adapter `vocabulary` mapping, which does not exist yet; the canonical parameter list must be owned somewhere before country #3. |
| **SOURCE-AGNOSTIC** | **PASS** | Country specifics live in clearly-labelled imported wire vocabularies (`vocabularies/dk|nl|lt`) that mint no mappings and in adapters; the E1d draft confirms the seam holds (all EE names stay in the adapter, only canonical names cross). |
| **PROVENANCE-AWARE** | **PARTIAL** | The envelope + Source/Evidence/Document split is the strongest part of the model and matches the ÖREB reference chain — but three demonstrated leaks route load-bearing semantics through the "never load-bearing" `note` (DK denominator §5.3, EE validity-basis §4.3, EE use-slot §3.5), and Evidence cannot cite a planning object's geometry (§4.2). |
| **TEMPORALLY AWARE** | **PASS with one gap** | `valid_from`/`valid_to` + `Version` + `Scenario.asOfDate` + lexicographic `isInForceOn` cover the OpenFisca pattern the audit chose, and four countries' state-served history maps onto it (REPORT §K.2) — but a legal date and an ingestion date are indistinguishable in the record (§4.3). |
| **SPATIALLY EXPLICIT** | **PARTIAL** | Native-CRS-with-coordinates is enforced everywhere it matters (the Madrid EPSG:4326 silent-zero trap is structurally dead) — but `geometryRef`/`Plan.geometryRef` dangle with no addressable referent, which the E1d draft proved by minting `dp_hoonestus:<objectid>` strings (§3.3). |
| **EXECUTION-CAPABLE** | **PARTIAL** | Scalar rules with validity resolve deterministically today (`isInForceOn`, null-guarded values), and the JSON-Logic carrier seam is right — but the step BEFORE execution ("which of the applicable rules binds") is not computable from the model because instrument rank/precedence has no seat (§3.4), and geometric constructions await the E1b operator/dialect split (§1.3). |

---

## Summary for the §8 assembler

- **§1**: JSON-Logic is correctly a carrier; no demonstrated incompatibility from
  BCRL/SHACL/XPlanung/IMOW; one E1b-scoped extension (body dialect tag) triggered by the first
  geometric construction; STTR/DMN round-trip NOT DECIDABLE until one tree is probed.
- **§3**: first-class Applicability IS justified — as a typed value object (basis[] typed refs,
  geometry, useScope, rank, condition), replacing the three untyped legs; exceptions/displaces
  links deferred by evidence.
- **§4**: Evidence needs two things NOW (planning-object ref kinds; a validity-basis flag);
  page/article/URL/doc-version/hash/date are already present and probed-adequate; spans, table
  locators, per-request URLs, intra-day timestamps deferrable with named triggers.
- **§5**: the six tiers survive, as a documented projection of the real axes; the missing axis
  is normative-force/semantic-ambiguity on a PRESENT value (LT/DK/DE all hit it); the DK
  denominator-in-note leak (§5.3) is the one REVISE-before-E1b item because every record written
  without the typed qualifier must be re-emitted.
- **§7**: SMALL/SEMANTIC/SOURCE-AGNOSTIC pass; PROVENANCE/SPATIAL/EXECUTION partial for the
  reasons above; TEMPORAL passes with the validity-basis gap.

### NOT DECIDABLE FROM EVIDENCE (consolidated, with settling probes)

1. **STTR/DMN → Rule.body round-trip** — fetch one toepasbare-regels tree with the free DSO key
   (REPORT §S.1 action) and attempt the mapping.
2. **BCRL construct compatibility** — permanently undecidable until a public BCRL spec exists
   (L1 §G.1: none does).
3. **NL `locatieRefs` referent severity** — settled by the NL adapter probe under the free key:
   do normwaarde location references resolve to objects the model must mirror, or only to
   geometry blobs?
4. **Whether table/text-span locators are ever needed** — settled by the Barcelona TS→data
   migration pilot (its citations are prose `ordinanceRef` today).
5. **Whether the tier-2/tier-4 convention causes real divergence at scale** — settled when the
   extraction pipeline first emits canonical records for a document-rule country (DE/CH/FR).
