# NATIONAL CAPABILITY REGISTER — the PRYZM Envelope Compiler programme (Spain)

**Status**: EXECUTABLE PROGRAMME, founder-commissioned 2026-08-02. **No code was changed to produce it.**
**Mission**: *given any parcel in Spain, generate the maximum legally defensible 3D buildable envelope with a complete evidence chain.*
**Single evaluation question** for every recommendation below: *does this increase the percentage of parcels for which PRYZM can generate a complete, legally defensible envelope?*
**Primary KPI**: **Envelope Completion Coverage (ECC)**. Determination Coverage is reported as product honesty, never as the ranking metric.
**Unit of analysis**: the **VARIABLE**, not the city and not the capability. *"Every completed row unlocks every city simultaneously."*

**Mandatory reads honoured before any line below** — [MACHINE-READABLE-EVIDENCE-REGISTER.md](./MACHINE-READABLE-EVIDENCE-REGISTER.md) (no `Closed` row re-probed) · [DECISION-REGISTER.md](./DECISION-REGISTER.md) (D-001…D-007, P-001…P-004) · [BLOCKER-CLASSIFICATION-STANDARD.md](./BLOCKER-CLASSIFICATION-STANDARD.md) · ADRs [0270](../../02-decisions/adrs/ADR-0270-geometric-rule-model-setback-vs-alignment.md) · [0271](../../02-decisions/adrs/ADR-0271-block-derived-buildable-depth.md) · [0283](../../02-decisions/adrs/ADR-0283-authoritative-publication-bounds-knowledge-unknown-is-valid.md) · [0284](../../02-decisions/adrs/ADR-0284-derived-geometry-permissible-derived-law-is-not.md) · [0285](../../02-decisions/adrs/ADR-0285-computing-an-observable-criterion-is-implementation.md) · [0286](../../02-decisions/adrs/ADR-0286-every-derived-value-exposes-legal-computational-source-and-tier.md) · [0287](../../02-decisions/adrs/ADR-0287-resolvers-refuse-when-uncertainty-changes-the-legal-outcome.md) · [0288](../../02-decisions/adrs/ADR-0288-machine-readable-is-not-publishable.md) · contracts C57 · C58 · C62 · C63.

**Deliverable 6 (Dataset Discovery Framework / Stage 0) is owned by another agent.** It is referenced here as capability **K2** with its dependencies and expected impact; its protocol is deliberately not designed in this document.

---

## 0 · THE FIVE FINDINGS THAT SHOULD CHANGE THE PROGRAMME

### F1 ⚠⚠ In the five measured cities, engineering can move ≈ 1.9 M m² — about 0.6 % of measured buildable land

Decomposing all **308.6 M m²** of measured buildable land by the *root cause* of why no envelope is drawn
(§11 derivations; two denominators are non-comparable upper bounds and are labelled at every use):

| Root cause | m² | share | Enters an engineering sprint? |
|---|---:|---:|---|
| Envelope already drawn | 57.3 M | 18.6 % | — |
| **Legally terminal** — the law grants no envelope | 91.9 M | 29.8 % | **No** (D-001, DEC-1, L-676) |
| **Delegated to an instrument PRYZM does not hold** | 68.7 M | 22.3 % | **No** (ADR-0283, D-006) |
| **External authority** — a publisher, a definition, a signature | 85.0 M | 27.5 % | **No** |
| **Engineering** | **1.9 M** | **0.6 %** | **Yes** |

Córdoba's own coverage-loss matrix, landed independently at `114cf11d`, sums to 100.000 % in the same
shape: **data unavailable 94.448 % · legally impossible 2.962 % · engineering 1.702 % · awaiting
interpretation 0.888 %.** Two cities, two methods, the same conclusion.

⇒ **The founder's rule — *"only engineering work enters implementation sprints; everything else is a
tracked external dependency"* — removes ~99.4 % of the measured remaining land from the sprint board.**
That is the single most consequential line in this brief. The programme's ROI therefore lives in
municipality **N+1 … N+8,132**, not in the five measured cities.

### F2 ⭐ THE THREE-STRIKE DISCOVERY PATTERN — the highest-confidence finding on this page

| # | The dataset | What we were doing instead | Cost |
|---|---|---|---|
| 1 | Murcia `Murcia:pgou_alineaciones` — block-level alignment polygons, published | Planning to dissolve a block ring from cadastral parcels | The 8.81 pp street-width slice was recorded as unreachable for weeks |
| 2 | Murcia `eje_comercial` — published, and **the consumer parameter already exists in our code** (`esMurciaAnchoDeCalle.ts:323 opts.ejeComercial`) | Nothing queried it | **0.7 pp** refuses `needs-eje-comercial` today, for want of a fetch |
| 3 | Córdoba `idecordoba:manzana` — **20,730 published block polygons**, 92.9 % of ordenanza polygons / 88.0 % of pilot ordenanza land (`114cf11d`) | Planning a dissolve engine, and carrying a P1 ceiling built on `0/3` | The dissolve "blocker" never existed (§F5) |

**Three datasets existed while we planned to construct their contents.** This is not three city bugs. It is
one platform bug: **PRYZM discovers datasets by hand.** ADR-0283 makes it worse than inefficient —
published geometry **outranks** our construction, so every hand-missed dataset is not merely wasted
effort, it is a **weaker legal tier than the one that was available**.

⇒ **Dataset Discovery (K2) and the Stage-0 discovery-before-construction protocol are the highest-leverage
process capability in the programme**, and the evidence for that is three measured strikes, not an
argument.

### F3 ⛔ Three of the founder's five national-unlock guesses are wrong — including both rated highest

| Founder's guess | Verdict | Measured grounds |
|---|---|---|
| **Buildable Depth — `Very High`** | ⛔ **REFUTED → `Low` today** | Depth is *already resolved* in all three cities that have it, by three strategies of one abstraction. Proof by experiment: closing depth in València on 2026-08-02 moved the ENVELOPE axis **0.0000** — *"CLOSING THAT BLOCKER SHORTENED THE PATH; IT ADDED NO COVERAGE."* And `explicit-area` (ADR-0270) **already is** València's rule kind (`6cc29040`) — no new solver is owed. |
| **Referenced Plans — `Critical`** | ⛔ **REFUTED as an envelope lever → `Low` generic / `Medium` selective** | ADR-0283: a plan we do not hold authorises nothing. D-006 signs ~2,595 partial plans **out of corpus**, over 15.60 % of one city's buildable land ⇒ **≈0.006 % of buildable land per plan.** ⚠ The *selective* version survives: instrument coverage is **heavy-tailed** — 169 distinct instruments in València, only **106 touch buildable land**, totalling **6.19 %** of it, and **26 carry 80 % (5 carry 50 %)**. A size-ranked admission queue is defensible; reading them all never pays. |
| **Alignment Geometry — `High`** | ✅ **CONFIRMED, and I would raise it** | It is the widest fan-out node in the dependency graph — upstream of height, depth, setbacks **and** the height datum. ⚠ But see F5: its *acquisition* strategy is the hard part, and one proxy has just been measured dead. |
| **Heritage — `Medium`** | ✅ / ⚠ **split** | `Medium` for importance, **`Low` for ECC** — heritage unlocks **zero** envelopes. It constrains **downward**, so its absence **over-states** every envelope where an overlay silently binds (L-616: a SOLID must intersect ALL derived constraints). |
| **Storeys and Occupation — `Done`** | ⛔ **REFUTED for Storeys** | Storeys is **the single most-blocking variable measured in Spain**: it gates **85.5 %** of València's buildable land (`6cc29040` — measured; the earlier 100 % was wrong), Madrid's NZ 4 (8.83 % of NZ land) and NZ 9.1/9.2, Córdoba's Manzana Cerrada (0.88 pp), and Murcia's entire band-edge residual. Occupation *is* effectively `Done` wherever a certified pack exists. |

### F4 ⚠ Madrid's 48.38 % is a **drawable 3D volume that is not an envelope** — and it is not yet safely publishable

`2a096355` answers **P-004** (the open question *"is NZ-3's pattern unique?"*). It is not. By legal
computation mode, Madrid's Norma-Zonal land is **envelope 27.85 % · existing-building 48.38 % ·
instrument 12.08 % · explicit-area 11.70 %**. *"Treating every zone as an envelope candidate mis-models
72 % of the city."* Six Chapter-8 parameters (Arts. 8.3.8.1 · 8.3.8.2 · 8.3.8.3.b · 8.3.6.4 · 8.3.7.2.a ·
8.3.7.2.b) compute **today** on the 48.38 % because they key on *parcela edificable*, which PRYZM holds.

**My scoring decision, stated explicitly as required:**

> **An intervention ceiling does NOT count toward Envelope Completion Coverage. It is scored in a new,
> separate national metric — Intervention-Ceiling Coverage — and it is NOT publishable in its current
> form.**

Three reasons, in increasing order of severity:
1. D-001 is settled: no *zoning entitlement* exists on that land. ADR-0284 forbids publishing an
   analytical construction *as* an entitlement.
2. ADR-0288 gate (2): the instrument must **grant** the determination. Arts. 8.3.8.x grant a *ceiling on
   permitted works*, not a development right. Published as what it is, that is defensible; published as an
   envelope, it is not.
3. ⚠ **The decisive one.** Art. 8.3.5.3.a).i) binds the substituted volume to the **existing building's own
   envolvente and total built area**. That datum is **measured not obtainable municipally** —
   `PG_ANALISIS_EDIFICACION` is `OBJECTID`-only across all 13 layers (probe P3, measured negative). So the
   six computable parameters yield an **upper bound whose binding ceiling is missing**, which is the L-616
   defect verbatim (*"a SOLID must intersect ALL derived constraints; an envelope that ignores one ceiling
   is worse than none"*). Madrid's own record already warns of exactly this: **"DO NOT PACK NZ 3 FROM NZ 5 /
   NZ 8."**

⇒ It is the **largest single drawable-volume opportunity in Spain (72.35 M m²)** and it needs a **product-
doctrine decision and its own ADR before one line of code**, not a sprint. Category: **Product doctrine**,
owner: the founder.

### F5 ⛔ The block-ring dissolve is not a capability. It is a fallback — and its "ceiling" never existed

- `Córdoba 0/3` was a **three-block sample**; measured at scale in two independent lineages, **Catastro
  INSPIRE 20/26 = 76.9 %** and **COACo 354/400 = 88.5 %** (`tools/cordoba-dissolve-probe/`). Barcelona's
  **production** dissolve measures **178/185 = 96.22 %**. `Madrid 2/4` is n=4 — not a rate.
- `packages/site-parcel-data/src/geometry/streetWidth.ts:28-40` **carries this correction verbatim** and
  adds the design fact that kills the framing outright: the width measurement deliberately **does not
  require the opposing block to dissolve**.
- ⚠ **The stale figure survives, uncorrected, in a second file.**
  `packages/site-parcel-data/src/providers/resolveMurciaStreetWidth.ts:47-49` still reads *"BCN 2/2, Madrid
  2/4, Córdoba 0/3"* and still concludes *"that is the whole reason the 8.81 pp is reachable here and not
  there."* **That is where the brief's version of the claim came from.** One-line fix; sixth recorded
  instance of a refuted number propagating.
- And `114cf11d` finishes it: Córdoba's block ring is **recovered from published data** (`idecordoba:manzana`,
  20,730 blocks). Under ADR-0283 published geometry outranks our construction. ⇒ **Block Ring Discovery
  demotes from a capability to a fallback**, exactly as the founder suspected.

---

## D1 · COMPILER ARCHITECTURE — the eight layers, with **verified** implementation status

Verification method: `git grep` over `packages/` and `apps/` for the named abstraction, plus a read of the
module header where one was found. **The coordinator's gap analysis is broadly right and wrong in two
places** — both corrections are in the notes.

| Layer | Purpose | Inputs | Outputs | Reusable interface | Status | Missing work |
|---|---|---|---|---|---|---|
| **0 · Parcel Context** | one immutable object: municipality → district → block → frontages → corner → flood → protection | click (lat/lon) | `ParcelContext` | C57 `ParcelFeature` | 🟡 **PARTIAL — and thinner than reported.** `ParcelContext` **does not exist as a symbol** (`git grep` → 0 hits). What exists: one national parcel provider (`providerId: 'catastro'`, gated by `SPAIN_BBOX`) in `parcelProviders/registry.ts`, `dissolveParcelsToBlockRing`, `classifyBlockFrontages`, and **10 per-city bbox gate modules**. **Corner, flood, airport and protection are not resolved anywhere.** | The context object; corner detection; the three overlay gates |
| **1 · Legal Instrument Resolution** | a `LegalStack`: which instruments govern, in what precedence, valid when, by whose authority, over what geometry | `ParcelContext` | `LegalStack` | — | 🟡 **PARTIAL — and there IS a precedence engine, just not the one that is needed.** `resolveJurisdictionClaim()` implements **extent** precedence (`district ≺ municipal ≺ metropolitan ≺ regional ≺ national`, ties ⇒ `ambiguous` ⇒ refused) and `resolveZoneDisposition` implements **disposition** precedence (`pack > legal-refusal > coverage-refusal`). ❌ What is absent is **instrument** precedence — PGOU vs Plan Especial vs Modificación Puntual vs PERI. `LegalStack` → 0 hits | The instrument-precedence engine; the stack object; validity dates (`effectiveDate` is established for **no** cited article in one city) |
| **2 · Variable Dependency Graph** | variables as nodes with declared dependencies (Height → Street Width → Alignment → GIS layer) | `LegalStack` | resolution order + the exact missing node | — | ❌ **DOES NOT EXIST** — confirmed, 0 hits | The whole layer. **This is what makes "blocked ONLY by depth" expressible** |
| **3 · Variable Resolution Engine** | the one municipality-independent pipeline (§D3) | variable + `ParcelContext` + `LegalStack` | value + provenance + confidence, or a typed unknown | — | ❌ **DOES NOT EXIST** — `variableResolver` / `resolveVariable` / `VariableResolution` → **0 hits across `packages/` and `apps/`.** Every city hard-wires its own path in a **hand-ordered `if` chain in `siteDispatch.ts`**, which `registry.ts:93-102` already flags as a drift hazard (*"the ordering is stated twice"*) | The whole layer |
| **4 · Dataset Resolver** | score every published layer → candidate variables | a GIS endpoint | ranked candidate bindings | — | ❌ **DOES NOT EXIST** — this is the `eje_comercial` platform bug (F2). ⭐ **Owned by the second agent (D6)** | — |
| **5 · Variable Provenance** | value + source + layer + article + method + confidence | any resolved value | `DerivationEntry` | `DerivationEntrySchema` | ✅ **EXISTS and is mandatory.** `BuildableEnvelope.ts:92` — `{constraint, value, zoneCode, source, fieldProvenance, ordinanceRef}`, and **C58 §1.3 requires one per numeric constraint** | Nothing structural |
| **6 · Constraint Graph** | heritage / airport / flood / road overriding base variables | base variables + overlays | composed constraint set | — | 🟡 **PARTIAL, and narrower than reported.** Exactly **one** implementation exists, in one city: `valenciaHeritageDisposition` / `applyValenciaHeritageConstraint`, with a deliberately two-member type (`applies` \| `may-apply-unknown`, **no `absent`**). Everywhere else, overlays are **static per-clau refusal families**, not composition | A generic `min()`-composition engine over N downward constraints |
| **7 · Envelope Synthesis** | footprint → setbacks → depth → occupation → extrude → roof → corner | constraint set | `BuildableEnvelope` → `MassingSolid[]` | `GeometricRule` union (ADR-0270) | ✅ **EXISTS.** `computeBuildableEnvelope` (`ZoningRulesEngine.ts:137`) → `envelopeToMassing` (`envelopeToMassing.ts:200`); five rule kinds; never-overstates invariant | Corner and roof-plane rules are per-city, not modelled |
| **8 · Explainability** | every face answers *"why?"* | `DerivationTrace` | UI | `DerivationTraceSchema` | ✅ **as data**, ⚠ **not per-FACE.** The trace is per-*constraint*; the founder wants the rear face itself to cite its article **and the street width it came from** | A face → derivation-entry binding in synthesis |

> **⇒ The compiler is roughly half-built, and the gap is specific and contiguous: layers 2, 3 and 4.**
> Layers 5, 7 and 8 are the expensive parts and they are done. **Do not redesign them.**

---

## D2 · NATIONAL VARIABLE MODEL

Eighteen variables. Per variable: legal meaning · dependencies · resolution strategy · evidence required ·
reachable confidence. **`Nat. block` = measured m² of buildable land across the five cities whose envelope
this variable currently blocks** (a variable is counted once, against its *binding* blocker).

| Variable | Legal meaning | Depends on | Primary strategy | Evidence required | Max tier | **Nat. block** |
|---|---|---|---|---|---|---:|
| **Storeys / Height** | *nº plantas*, *altura reguladora* — usually a table keyed on street width or a plan annotation | Street Width · Alignment · Corner · Vertical Datum | published value ▸ annotation ▸ construct | article + band table + width or annotation semantics | `estimated-ruleset` | **≈29 M m²** ⭐ |
| **Street Width** | *ancho de calle / amplada de vial* — the criterion, frequently with **no** prescribed method | Alignment · Block Ring · Opposing frontage | published geometry ▸ construct (ADR-0285) | alignment polygons + a **check that no method is prescribed** | `estimated-ruleset` | (upstream of Height) |
| **Alignment / Building Line** | *alineación oficial* — the line depth, setback, width and height datum are measured **from** | Block Ring · published alignment layer | published geometry ▸ adjacency ▸ ❌ never infer | authoritative published alignment or frontage adjacency | `estimated-ruleset` | (upstream of 4 variables) |
| **Buildable Depth** | *profundidad / profunditat edificable* | Alignment · Block Ring | published polygon ▸ stated scalar ▸ construct from block | article or published *área de movimiento* | `block-constructed` (0.7) | **≈0** ⛔ |
| **Occupation** | *ocupación* % or a tiered rule | Depth · Setbacks | published value | article | `estimated-ruleset` | ≈0 where certified |
| **FAR / Edificabilidad** | m²/m², sometimes an **algorithm** not a lookup (ADR-0271) | Block Ring (where constructed) | published value ▸ construct | article | `block-constructed` | ≈0 where certified |
| **Front / Rear / Side Setback** | *retranqueos*; may be **zero**, making the buildable front the parcel boundary | Alignment · Corner | published value | article | `estimated-ruleset` | ≈0 where certified |
| **Governing Street** | which frontage governs on a multi-frontage parcel | Alignment · Corner | **ordinance-prescribed** | ⚠ the article, **read** | — | see ⚠ below |
| **Corner Condition** | corner parcels take a different datum, a different governing street, and a run-on allowance | Alignment · Block Ring | published geometry + article | article | — | unmodelled |
| **Vertical Datum (*rasant*)** | the reference level height is measured from — the façade, not the centroid | Alignment · Terrain resolution | published DTM at ≤ Nyquist | article + a terrain posting fine enough | — | 0 new; **protects 57.3 M m²** |
| **Heritage / Protection** | a downward constraint; may set the envelope **= the existing building** | overlay layer | published geometry ▸ **refuse where it may apply** | the overlay, or an honest unknown | — | 0 new; **prevents over-statement** |
| **Existing-Building Constraint** | *envolvente exterior* + total built area — the ceiling on intervention | existing-GFA datum | published value | ⚠ **measured not obtainable municipally** | — | gates 72.35 M m² of §F4 |
| **Governing Instrument** | which plan orders this land | register payload | published register | in-force confirmation | `index-cited` **only** | 0 (terminal branch) |
| **Delegation / Overrides** | whether the general plan defers to a derived instrument | Governing Instrument | published attribute (`origen`, `PLAN`, *actuaciones*) | the attribute, read live | — | 0 (terminal) |
| **Special Conditions** | *eje comercial*, frontage class, road hierarchy | published thematic layer | published value | the layer | `estimated-ruleset` | **0.7 pp** in one city — F2 strike 2 |
| **Roof Planes** | *cubierta* geometry above the cornice | Height · Corner | published value | article | — | unmodelled |
| **Airport / Flood / Infrastructure** | statutory downward constraints outside the PGOU | overlay layers | published geometry | the overlay | — | **unmodelled, unmeasured** ⚠ |
| **Parcel Geometry** | the *parcela edificable* | — | published | Catastro | `authoritative` | ✅ **~95 % national.** ⚠ 524 foral municipalities excluded |

⚠ **`Governing Street` and `Street Width` carry a correction that invalidates a general claim.**
The Murcia agent has just measured that Art. **4.5.3** *does* prescribe a method
(*«ancho entre alineaciones de parcela … media aritmética … hasta completar la manzana»*) — it **confirms
our input** but contradicts our **aggregation** (we take a per-edge median), and Art. **4.5.4** gives a
corner *solar* the **widest** street while `governingStreetWidth` takes the **narrowest** (`sorted[0]`, per
PGM Art. 238.1.b/c — a *Barcelona* rule applied in a *Murcia* resolver). **Both errors under-grant.**
⇒ **ADR-0285's test 2 ("the method is unprescribed") is NOT universally satisfiable and must be checked
per city, per article — never assumed.** This is now an explicit branch in D3, and it is a correction to a
claim this programme was about to generalise nationally. *(Reported by the Murcia agent; not independently
verified here — I did not find Arts. 4.5.3/4.5.4 in the repo corpus.)*

### D2.1 · NATIONAL VARIABLE MATRIX — variable × city

Cell key, using the founder's resolution columns: **`V`** published *value* · **`G`** published *geometry* ·
**`A`** published *annotation* (semantics unbound) · **`P`** referenced *plan* · **`C`** legally
*constructible* (ADR-0285) · **`L`** *legally* terminal — the ordinance grants nothing · **`—`** not
applicable · **`?`** unknown/unmeasured. `✅` = resolves today. `⛔` = blocks an envelope today.

| Variable | Barcelona | Madrid | Murcia | València | Córdoba | **Blocking dependency (the payload)** | **National unlock** |
|---|---|---|---|---|---|---|---|
| **Storeys / Height** | ✅ `C` Art. 327 via width | ⛔ `V` for 23 zones but **uncertified**; NZ 4/9 need width | ✅ `C` on 51.3 %; ⛔ **44.6 % band-edge** | ⛔ `A` — `altura` unbound, gates **85.5 %** | ⛔ `V` per-street-width table, no width source | 4 different dependencies, 1 symptom: **certification · width · annotation-semantics · band-edge precision** | **Very High** ⭐ |
| **Street Width** | ✅ `C` | ⛔ absent ⇒ NZ 4/9.1/9.2 publish no height | ✅ `C` from published alineaciones | — | ⛔ **no alignment layer exists** (105 WFS + 119 WMS + 15, measured) | **Alignment geometry**; the street-network proxy is measured dead | **High** |
| **Alignment / Building Line** | 🟡 dissolved; Art. 238 *tram* open | ⛔ measures *fondo* from the **cadastral** edge — a live OVER-statement | ✅ `G` published; ⚠ front edge picked by **orientation** not adjacency | ✅ `G` Layer 212 | ✅ **adjacency** — zero front setback ⇒ the parcel boundary is the front (`114cf11d`) | Published alignment, else **frontage adjacency**, else block ring as fallback | **High** |
| **Buildable Depth** | ✅ `C` Art. 242.2 | ✅ `V` (behind certification) | ✅ `V` 15 m stated | ✅ `G` Layer 212 (D-005) · `explicit-area` **already the rule kind** | ✅ `V` (UAD depth authored, pack omission = P1) | **none** — resolved by 3 strategies of 1 abstraction | ⛔ **Low** — refutes the `Very High` guess |
| **Occupation** | ✅ `V` | ⛔ certification | ✅ `V` | ⛔ blocked upstream by height | ⛔ certification + resolver call | certification, not the variable | **Done** where certified |
| **FAR / Edificabilidad** | ✅ `C` (an algorithm, ADR-0271) | ⛔ certification | ✅ `V` | ⛔ upstream | ⛔ **derived by algorithm**, correctly emits `null` | certification | **Done** where certified |
| **Front/Rear/Side Setback** | ✅ `V` (`20a/*`) | ⛔ certification; **NZ 5 measures to the STREET CENTRELINE — a kind `GeometricRule` cannot express** | ✅ `V` | ⛔ upstream | ⛔ **UAD depth stated in the article, absent from the pack — OVER-states** | certification + one missing rule kind | **Medium** |
| **Governing Street** | ✅ narrowest (PGM Art. 238.1.b/c) | ? | ⚠ **narrowest applied where Art. 4.5.4 says widest** — under-grants | — | ? | ⚠ **the article, read per city** — this is prescribed, never derived | **Medium** |
| **Corner Condition** | ✅ Art. 240.3.a/b transcribed | ? | ⛔ under-grants | ? | ? | unmodelled as a platform variable | **Medium** |
| **Vertical Datum (*rasant*)** | ⛔ terrain 57.34 m median spacing; **0 samples in a 1,000 × 20 m street** | ⛔ same + article not transcribed | ⛔ | ⛔ | ⛔ | **terrain posting ≤ 10 m** (national free 5 m DTM) + the article | **High** (compliance; 0 ECC) |
| **Heritage / Protection** | ⛔ Ciutat Vella, not resolved | ⛔ | ⛔ | 🟡 refuse-path **ships**; layers **499 = UNKNOWN, not absent** | 🟡 Art. 13.3 static refusal | published overlay, else refuse-where-may-apply | **Medium** (0 ECC; prevents over-statement) |
| **Existing-Building Constraint** | — | ⛔ **datum not obtainable municipally** (P3 measured negative) | — | — | 🟡 Art. 13.3 | the existing-GFA datum — **and a founder ADR** | ⚠ **Product doctrine** |
| **Governing Instrument** | 🟡 `PD*` on **70.69 %**, marker semantics unknown (P-002) | ✅ `V` NZ code | ✅ marker classifier | ⛔ `origen` published, **not read live** | 🟡 pilot only | the register read + **the marker's meaning** | **Low on ECC** |
| **Delegation / Overrides** | ✅ cited | ✅ cited | ✅ cited | ⛔ **weaker refusal ships** because `origen` is unread | ⛔ `derivedPlanningOverride` **authored, never called** | the attribute, read live | **Low on ECC** |
| **Special Conditions** | — | — | ⛔ **`eje_comercial` published; consumer param exists; nothing fetches it** — 0.7 pp | — | — | **a fetch** | **Medium — days** |
| **Roof Planes** | ? | ? | ? | ? | ? | unmodelled | **?** |
| **Airport / Flood / Infrastructure** | ⛔ | ⛔ | ⛔ | ⛔ | ⛔ | **entirely unmodelled and unmeasured** — constrains downward, so absence can only OVER-state | ⚠ **unknown, and it is the largest unexamined exposure** |
| **Parcel Geometry** | ✅ | ✅ 99.6 % | ✅ | ✅ 99.2 % | ✅ 95 % | — (⚠ 524 foral municipalities excluded nationally) | **Done** |

⚠ **Read the Height row as the thesis of this document.** One variable, five cities, **four completely
different blocking dependencies** — and today the product emits the same *"no envelope"* for all of them.
That is the layer-2 gap made visible.

---

## D3 · THE VARIABLE RESOLUTION PIPELINE (municipality-independent)

```
resolveVariable(variable, parcelContext, legalStack) → Resolution | TypedUnknown

 0 ▸ IS A METHOD PRESCRIBED BY THE INSTRUMENT?          ⚠ NEW, MANDATORY, FIRST
     yes → that method BINDS. Any other is an amendment (ADR-0285 test 2).
           Implement it exactly, or refuse. ⟵ Murcia Art. 4.5.3/4.5.4 forced this branch
     no  → continue

 1 ▸ PUBLISHED VALUE          the authority publishes the number as data
                              → tier up to `structured`; ⚠ ADR-0288 gate 2: does the
                                instrument GRANT it, or is this a harmonised aggregator?

 2 ▸ PUBLISHED GEOMETRY       the value is DRAWN (movement polygon, alignment, block ring)
                              → ADR-0283: published geometry OUTRANKS our construction.
                                ⚠ F2: you must have LOOKED (Stage 0 / K2) before step 5.

 3 ▸ PUBLISHED ANNOTATION     a published attribute whose legal meaning is unbound
                              → refuse until an authority binds it (ADR-0287).
                                NEVER infer semantics. NEVER a heuristic.

 4 ▸ REFERENCED INSTRUMENT    a derived plan governs
                              → identify + cite it (index-cited). Admit its numbers ONLY if
                                the instrument is individually analysed and in force.
                                Terminal by default (ADR-0283, D-006).

 5 ▸ LEGALLY CONSTRUCTIBLE    ADR-0285 four-part test, ALL FOUR:
                              (1) criterion stated  (2) method unprescribed  ⟵ step 0
                              (3) input is AUTHORITATIVE PUBLISHED geometry
                              (4) reproducible
                              → tier caps at `estimated-ruleset` / `block-constructed`.
                                ⚠ Test 3 is where proxies die (see below).

 6 ▸ TYPED UNKNOWN            with the reason, the article, and the exact missing dependency.
                              A refusal is a correct answer (C58 §1.5). It is not an envelope.
```

⚠ **Step 5 test 3 has just claimed its first victim, measured.** Córdoba's `sup_viales` street-network
polygons were the obvious alignment proxy. Across **both** publishers' full inventories (105 WFS + 119 WMS
+ 15 layers) there is **zero** alignment geometry. The proxy produced a *plausible* 9.12 m median —
*"plausible, which is the trap"* — and was killed not by implausibility but by **band-edge arithmetic**:
Manzana Cerrada's bands are **2 m apart**, so **45.4 % of streets sit within ±1 m of a band edge** and
ADR-0287 refuses every one. **A proxy that produces a plausible number and refuses half the parcels is
worse than a refusal, because it looks like progress.**

---

## D4 · CAPABILITY INVENTORY

`ECC Δ` = expected increase in **Envelope Completion Coverage** across the five measured cities, as
measured m² (extrapolation to the other 8,127 municipalities is labelled where used).
Maturity: ✅ shipped · 🟡 partial/authored-unwired · ❌ absent.

| # | Capability | Maturity | Municipalities using | Municipalities blocked by it | **ECC Δ (measured)** | National impact | Effort | Depends on |
|---|---|---|---|---|---:|---|---|---|
| **K1** | **Ordinance transcription + bounded human certification (L-449 at scale)** | 🟡 pipeline ✅ / certification workflow ❌ | Barcelona · Murcia (signed) | **Madrid · Córdoba · all 8,132** | **41.7 M m²** (Madrid 27.847 %; **25.8 M m²** under SIG-M1's current scope) + 0.57 M m² (Córdoba) | **Very High** — the rate limiter for every municipality in Spain | Medium (tooling); ⚠ the signature is **not engineering** | — |
| **K2** | **Dataset Discovery Engine + Stage-0 discover-before-construct protocol** ⭐ *(D6, second agent)* | ❌ | none | **all** | **0 directly** — but 3 measured strikes (F2), one worth 0.7 pp today, one that recovered a whole block-ring layer, one that recovered an alignment layer | **Very High** — turns "weeks per city" into a scored inventory | Medium | — |
| **K3** | **Variable Resolution Engine (layers 2+3)** | ❌ (0 hits) | none | **all** | **0 directly**; makes every other capability plug in once instead of per-city | **Very High** — without it, capability reuse is by convention only and `siteDispatch.ts` drifts | Large | layer 5 ✅ |
| **K4** | **Regional zoning-service adapter framework** | 🟡 seam ✅ (C57), per-region adapters ❌ | Cataluña · Madrid · C. Valenciana · Andalucía(pilot) · Murcia | Balears 67 · Canarias 88 · Euskadi 252 · the long tail | 0 in the five | **Very High** — ~17 publishers cover 8,132 municipalities | Medium/region | K3 |
| **K5** | **Alignment Discovery + frontage resolution** (⚠ **not** "Alignment Construction") | 🟡 consumers ✅, acquisition per-city | Murcia (published) · València (published) · Barcelona (dissolved) · **Córdoba (adjacency, `114cf11d`)** | Madrid | Madrid NZ 4 **13.2 M m²** (behind K1) + fixes a live over-statement; Córdoba **0.567 M m²** | **High** — upstream of 4 variables | Medium | K2 · K3 |
| **K6** | **Street Width Resolver** → rename **Geometry-derived Ordinance Variable Engine** (§D4.1) | ✅ region-agnostic core; ⚠ **two measured defects** | Murcia (+4.52 pp realised) · Barcelona | Madrid NZ 4/9.1/9.2 · Córdoba MC | ≤ **+0.36 pp** in Murcia; 0.29 M m² Córdoba; 13.2 M m² Madrid behind K1 | **High** for N+1 | Small/city | K5 |
| **K7** | **Legal Vertical-Datum Resolver (*rasant*)** | 🟡 legal ✅ CLOSED, code ✅ authored, **unwired** behind a hard `terrain-posting-too-coarse` refusal | none | **every city that already draws** | **0 new; protects 57.3 M m²** already published | **High** as compliance, `Low` on ECC | Small (a two-value bake config + wiring) | national 5 m DTM |
| **K8** | **Constraint Composition Engine** (generic downward `min()` over N overlays) | 🟡 one city, one overlay | València | all | **0 new; prevents over-statement** on everything drawn | **Medium** | Medium | K3 |
| **K9** | **Heritage Resolver** | 🟡 refusal path ✅ shipped (València), data ❌ | València | all | 0 | **Medium** | Medium | K8 · K2 |
| **K10** | **Instrument Precedence Engine + Governing-Instrument Signpost** | 🟡 signpost **built, tested and UNWIRED**; precedence ❌ | none | Barcelona 70.69 % · Murcia 67 % · València 36.40 % | **0 envelopes, by design** | **Low on ECC · Very High on product honesty** | Small (wire) / Medium (dispatch mode) | K3 |
| **K11** | **Buildable Depth Resolver** (one abstraction, four strategies) | ✅ 3 of 4 strategies ship | Barcelona · Murcia · Córdoba · Madrid | none | **≈0** — proven by experiment | **Low today, Medium for N+1** | Medium | — |
| **K12** | **Existing Building Resolver / intervention ceiling** | ❌ | none | Madrid 48.38 % (72.35 M m²) | **0 ECC** — scored in a *separate* metric (§F4) | ⚠ **Product doctrine, not engineering.** Blocked on a missing legal datum + an ADR | ⛔ Do not sprint | founder decision |
| **K13** | **Envelope Synthesiser** | ✅ | all | none | — | **Done** | — | — |
| **K14** | **Explainability Engine** | ✅ as data; ❌ per-face | all | none | 0 | **Medium** (KPI 4 is near-free) | Small | K13 |
| **K15** | **Block Ring Discovery** | ✅ dissolve 76.9–96.2 %; ⭐ **demoted to fallback** by published `manzana` | Barcelona · Córdoba | none | 0.54 M m² (a `refcat` block-**identity** defect) | **Low** | Small | K2 |

### D4.1 · Proposed rename — and why the founder's correction is right in code as well as in framing

ADR-0289 landed framed on street width. But the region-agnostic module's own header already states
*"REGIONAL SCOPE — DELIBERATELY NONE"*, and its exports (`measureStreetWidths` ·
`blockEdgesFacingParcel` · `governingStreetWidth`) take **rings and return metres** — they know nothing
about streets. The abstraction is **resolving an ordinance variable from authoritative geometry**;
street width is one instance, and frontage, plaza, corner, opposing frontage and block depth are the next.

> **Proposed: `Geometry-derived Ordinance Variable Engine`** (short form **Variable Resolution Engine**,
> layer 3). ⚠ **ADR-0289 is not edited here** — the Murcia agent authored it and a second editor would
> fork it. The rename is *proposed* for the orchestrator to land, together with the two measured defects
> in §D2 (per-edge median vs prescribed *media aritmética*; narrowest vs widest on a corner).

---

## D5 · NATIONAL DEPENDENCY MATRIX — ranked, and classified for the sprint gate

Founder rule applied: **only `Engineering` rows enter implementation sprints.** Everything else is a
tracked external dependency with a named owner.

| Rank | Dependency | Class | Blocks (measured m²) | Barcelona | Madrid | Murcia | València | Córdoba | Sprint? |
|---:|---|---|---:|---|---|---|---|---|---|
| 1 | **Human legal certification (L-449 signature)** | **External authority** | **42.3 M** | ✅ signed | ⛔ **SIG-M1 unsigned — 27.85 %** | ✅ signed | ⚠ gate **unliftable** (`zones` empty by construction) | ⛔ SIG-1 unsigned | ❌ track |
| 2 | **Zoning geometry published as authoritative data** | **Data** | **31.5 M** | ✅ AMB Refós | ✅ NORMAS_ZONALES | ✅ GeoServer | ✅ MapServer/231 | ⛔ **94.448 %** — 41/49 sheets a 69-byte error page, **no `.prj` on any** | ❌ track (**D-002: engineering not authorised**) |
| 3 | **Published-annotation semantics bound by the authority** | **External authority** | **16.0 M** | ✅ | ⚠ `COEF_Z` closed on negative evidence | ✅ | ⛔ **`altura` gates 85.5 %** (`6cc29040` — not 100 %) | ✅ | ❌ track |
| 4 | **Alignment / frontage geometry** | **Engineering + Data** | **13.8 M** (mostly behind #1) | 🟡 dissolved; Art. 238 *tram* open | ⛔ **measures *fondo* from the CADASTRAL edge — a live OVER-statement** | ✅ published; ⚠ front edge picked by **orientation**, not adjacency | ✅ Layer 212 | ✅ **adjacency, `114cf11d`** — zero front setback ⇒ the parcel boundary is the front | ✅ **sprint** |
| 5 | **Referenced plans admitted to corpus** | **Legal** | 68.7 M (terminal) | ⛔ ~2,595, **signed out** (D-006) | ⛔ 12.08 % | ⛔ 67 % | ⛔ 36.40 %, **26 of 169 carry 80 %** | ⛔ 2.185 % | ❌ track (selective queue only) |
| 6 | **Existing-building GFA datum** | **Data → Product doctrine** | 72.35 M (§F4) | n/a | ⛔ **not obtainable municipally** (P3, measured negative) | n/a | n/a | 🟡 Art. 13.3 family | ⛔ **ADR first** |
| 7 | **Terrain at ordinance resolution (≤ 10 m posting)** | **Data + Engineering** | 0 new; **protects 57.3 M** | ⛔ 57.34 m median spacing; **0 samples in a 1,000 × 20 m street** | ⛔ same defect | ⛔ | ⛔ | ⛔ | ✅ **sprint** (national free 5 m DTM) |
| 8 | **Heritage / downward overlays** | **Data** | 0 new; over-statement risk | ⛔ Ciutat Vella | ⛔ | ⛔ | 🟡 refuse-path **ships**; 17 folders **499 `Token Required` = UNKNOWN, not absent** | 🟡 Art. 13.3 | ❌ track |
| 9 | **Special-condition thematic layers** | **Engineering** | **0.53 M** | — | — | ⛔ **`eje_comercial` published; consumer parameter already exists; nothing fetches it** — 0.7 pp | — | — | ✅ **sprint — days** |
| 10 | **Block ring** | **Engineering (fallback)** | 0.54 M | 🟡 96.22 % | 🟡 n=4 | ✅ published | ✅ | ✅ **published, 20,730 blocks** | ✅ small sprint |
| 11 | **Sub-zone selector granularity** | **Data** | 0.49 M | ⛔ bare 20a — *a missing SELECTOR, not a missing rule* | — | — | — | ⛔ 14 bare `O_MC` polygons; **key is COACo's to publish** | ❌ track |
| — | **Foral cadastre** | **Engineering** | unmeasured; **524 municipalities** | — | — | — | — | — | ✅ later sprint |

**⇒ Of the top six national dependencies, exactly ONE is engineering.** That is the programme's central
scheduling fact.

---

## D7 · ENVELOPE COMPLETION INDEX (per parcel)

```
EnvelopeCompletionIndex {
  parcelContext:      resolved | partial | failed          // layer 0
  legalStack:         resolved | ambiguous | unresolved    // layer 1
  variablesResolved:  n / m   + the BLOCKING variable ids  // layers 2-3  ⟵ the payload
  constraintsApplied: n / k   + any overlay UNKNOWN        // layer 6
  envelopeGenerated:  yes | no | intervention-ceiling-only // layer 7   ⟵ third state, §F4
  evidenceComplete:   every numeric constraint has a DerivationEntry with an ordinanceRef  // layer 5
  explainability:     per-constraint ✅ | per-face ❌      // layer 8
}
```

**The design rule that makes this worth building**: the product output must be
*"envelope blocked ONLY by `storeys`, which is blocked by `streetWidth`, which is blocked by
`alignment`, which has no published source"* — **never** *"cannot compute"*. That chain is layer 2, and
it is the single most user-visible thing missing from the compiler.

⚠ **`envelopeGenerated` has three states, not two.** The `intervention-ceiling-only` state exists because
of §F4 and it must **never** aggregate into KPI 1.

---

## D8 · THE KPIs — tracked every sprint

| # | KPI | Definition | Baseline (five cities, measured) | Notes |
|---:|---|---|---|---|
| **1** | **Envelope Completion Coverage** ⭐ | % of buildable land where a 3D envelope is generated | **18.6 %** (57.3 M / 308.6 M m²) — BCN 58.93 · MUR 28.03 · MAD 11.695 · VLC 0 · COR 0 | **The primary product KPI.** ⚠ Madrid's 11.695 % is **signed but its render is unconfirmed** |
| **2** | **Determination Coverage** | % where PRYZM determines the governing outcome (envelope **or** cited refusal) | BCN 98.30 · MUR 95.03 · MAD 72.15 · VLC 36.40 · COR 2.96 | Product honesty. **Never the ranking metric** |
| **3** | **Variable Resolution Coverage** | % of required variables resolved, **reported per variable and nationally** | ❌ **not measurable today — layer 2 does not exist.** The variable matrix is a table, not a measurement | K3 turns this from a document into an instrument |
| **4** | **Dataset Discovery Success** | published layers found ÷ published layers existing | ❌ unmeasured. Known false negatives: **3 (F2)** | Owned by K2/D6 |
| **5** | **Capability Reuse** | municipalities improved per capability shipped | K6 = 2 · K11 = 4 · K10 = 0 | The anti-`One-off` gate |
| **6** | **Engineering ROI** | ΔKPI-1 per engineering month | ⚠ **In the five cities the ceiling is ~0.6 % of buildable land (F1).** Measure N+1 instead | Forces the programme outward |
| **7** | **Unknown Reduction** | Δ `no-pack` + Δ typed-unknown, **measured not estimated** | BCN 1.70 · MUR 4.97 · MAD 27.85 · VLC 63.60 · COR 97.04 | ⚠ Must fall for the **right** reason. València's `Data unavailable` reached **0.00 %** (`6cc29040`) without ECC moving at all |
| **+** | *Intervention-Ceiling Coverage* | drawable volumes that are **not** envelopes | 0 % of a 72.35 M m² opportunity | **New, separate, and gated on an ADR (§F4)** |

---

## D9 · IMPLEMENTATION ROADMAP — by capability

Sprint loop, as the founder specified: *select the highest national-impact dependency → classify → design
**one generic resolver** → validate in **one reference city** → integrate into core → **re-run every
municipality** → measure → repeat.* ⚠ **Murcia is a reference implementation, not a target** — its
remaining derivable work is worth **≤ +0.36 pp**. Score it that way.

### Phase 0 — STOP AND CORRECT (this week · zero engineering · ΔKPI 0)
Stop the three investigations named in §Q4. Correct `resolveMurciaStreetWidth.ts:47-49` (stale `0/3`) and
Barcelona's `ENVELOPE.md` coverage figure (**60.63 % → 58.93 %**; the difference is the 1.70 pp where the
dissolve refuses and `refuseConstructionIncomplete` publishes **nothing**).
**Risk if skipped**: a sixth propagation of a refuted number. **Validation**: `git grep 0/3` returns only
the corrected comment.

### Phase 1 — THE DISCOVERY GATE (K2 · owned by the second agent · ΔKPI 4 from 0 → measurable)
**Rationale**: three measured strikes, and ADR-0283 makes each one a *tier* loss, not just a time loss.
**Validation**: re-run discovery against the five measured cities and count how many of the three known
misses it would have caught. If it catches fewer than three, it is not ready.
**Benefits immediately**: all five, and every future municipality. **Risk**: a scorer that surfaces 400
layers is the same problem with extra steps — it must *rank*, and its precision must be measured.

### Phase 2 — THE MISSING COMPILER LAYERS (K3, then layer 2 · Large · ΔKPI 3 from ❌ → measurable)
**Rationale**: `variableResolver` returns **0 hits**; every city hard-wires its own path in a hand-ordered
`if` chain that `registry.ts` itself flags as drift-prone. Until layer 2 exists, *"blocked only by depth"*
is not expressible and KPI 3 cannot be computed.
**Tasks**: the variable node model + dependency edges; the six-step pipeline of §D3 with **step 0 as an
explicit branch**; migrate one city's dispatch behind it.
**Validation**: reproduce all five cities' current measured coverage **byte-identically** through the new
engine before any city is migrated. **Risk**: a rewrite that changes a published number is a correctness
event, not a refactor.
**Benefits**: all, indirectly. **ΔKPI 1: 0.** Say so out loud — this is infrastructure.

### Phase 3 — THE RATE LIMITER (K1 · ΔKPI 1 **+41.7 M m² measured**, the largest on the board)
**Rationale**: one city's 27.847 % waits on one human reading Título 8. The pack exists — 282 records,
1,321 quotes machine-re-read against the in-repo PDF, **0 fabricated, 0 mis-paged**.
**Tasks**: build P-001's review artefact (*records reviewed by risk class · issues found · issues corrected
· unresolved items*) as a **reusable template + tool**; run it once end to end.
**Validation**: a third party can read the cover sheet and tell whether the exit criterion was met.
**Risk**: ⚠ the reviewer is a scarce, non-substitutable resource; the tool must minimise their time, not
document ours. **A machine may not sign** (L-449) — and `l449CertificationGates.ts` now dereferences every
claimed signature, having found violations in **NL and FR** on its first run.
**Benefits immediately**: Madrid, Córdoba, and the certification cost of all 8,132.

### Phase 4 — THE FAN-OUT NODE (K5 → K6 · ΔKPI 1 +0.9 M m² now, **+13.2 M m² behind Phase 3**)
**Rationale**: alignment is upstream of storeys, depth, setbacks and the vertical datum, and it is a **live
over-statement** in one city (depth measured from the cadastral edge).
**Tasks**: alignment acquisition as a *registered per-source strategy* (published polygon ▸ published
polyline ▸ **adjacency**, per `114cf11d` ▸ dissolved ring as **fallback**); then Murcia's two measured
width defects (per-edge median vs prescribed *media aritmética*; narrowest vs widest on a corner).
⛔ **Do not build a street-network proxy.** Measured dead: 45.4 % of streets within ±1 m of a 2 m band edge.
**Validation**: the width defects must move Murcia's measured coverage **up**, since both under-grant.
**Risk**: a proxy that looks plausible (9.12 m) and refuses half the parcels.

### Phase 5 — CORRECTNESS ON WHAT IS ALREADY DRAWN (K7, K8, K9 · ΔKPI 1 **0**)
**Rationale**: 57.3 M m² of published envelope is seated on a flat slab at the *centroid* elevation while
the ordinance measures at the **façade**, and nothing intersects a heritage overlay we cannot read.
K7's legal half is **closed** (Art. 240, all four branches, transcribed verbatim); the code is written and
refuses honestly; the input is a national free 5 m DTM and the wiring is *"a two-value config change in the
bake."*
**Risk**: ⚠ **the bake is owned by an in-flight run — sequence, do not race.**
**Validation**: the Nyquist guard the code already enforces must go from refusing to resolving.
⚠ *Defects that lower no metric are the ones deferred forever. Name it, or it will be.*

### Phase 6 — SCALE (K4, then K14 · ΔKPI 1 unmeasured, **the whole national thesis**)
Regional adapters for the four CCAA holding **60 % of the SEED tier** (57 + 52 + 50 + 31 = 190 of 318).
Then per-face explainability (KPI 4 is near-free given layer 5).
**Validation**: each adapter must raise KPI 5 (municipalities improved per capability) by ≥ 50.

### Phase 7 — PRODUCT HONESTY ON TERMINAL LAND (K10 + the missing `legally-delegated` tier · ΔKPI 1 **0**)
Wire the **already-built, already-tested, unwired** instrument signpost; add instrument-keyed dispatch so
admitting **one** analysed plan is a data addition; add the tier that currently makes a cited legal
determination score identically to PRYZM's own gap over **60.46 % / 67.00 % / 36.40 %** of three cities.

### ⛔ NOT SCHEDULED
K12 (needs a founder ADR, §F4) · zoning-raster vectorisation (**D-002: not authorised**) · exhaustive
referenced-plan admission (**D-006**) · any further dissolve work as a coverage lever (**F5**).

---

## D10 · GAP ANALYSIS

| Layer | Status | Evidence |
|---|---|---|
| 0 · Parcel Context | 🟡 | `ParcelContext` → 0 hits; one national parcel provider + 10 per-city bbox gates; corner/flood/airport/protection **unresolved** |
| 1 · Legal Instrument Resolution | 🟡 | extent **and** disposition precedence exist; **instrument** precedence and `LegalStack` do not |
| 2 · Variable Dependency Graph | ❌ | 0 hits |
| 3 · Variable Resolution Engine | ❌ | `variableResolver` / `resolveVariable` / `VariableResolution` → **0 hits**; a hand-ordered `if` chain instead |
| 4 · Dataset Resolver | ❌ | the `eje_comercial` bug; **owned by D6** |
| 5 · Variable Provenance | ✅ | `DerivationEntrySchema:92`; C58 §1.3 mandates one per numeric constraint |
| 6 · Constraint Graph | 🟡 | exactly one overlay, in one city, with a deliberately two-member type |
| 7 · Envelope Synthesis | ✅ | `computeBuildableEnvelope:137` → `envelopeToMassing:200`; five rule kinds; never-overstates invariant |
| 8 · Explainability | ✅ data / ❌ per-face | `DerivationTraceSchema`; no face → entry binding |

---

## 5 · THE FIVE QUESTIONS

### Q1 · Which FIVE capabilities unlock the largest increase in 3D envelopes across Spain?
**K1** (certification — 41.7 M m² measured, and the ceiling for all 8,132) · **K2** (dataset discovery —
three measured strikes) · **K3** (variable resolution engine — the missing contiguous gap) · **K4**
(regional adapters — ~17 publishers for 8,132) · **K5** (alignment discovery — the widest fan-out).
⚠ **None of them moves the five measured cities much, because those cities have ~1.9 M m² of
engineering-addressable land between them (F1).** They are ranked for municipality N+1.

### Q2 · Which belong in the PRYZM core platform?
**Core Platform**: K1 (certification machinery + L-449 gates) · K2 · K3 (layers 2+3) · K4 (the C57/registry
seam) · K7 · K8 · K10 · K14.
**Shared Engine**: K5 (frontage contract; acquisition per source) · K6 (the geometry-derived variable
solver) · K9 · K11 (the strategy catalogue) · K13.
**City Rulepack**: the numbers, the band tables, the rule kind per zone, and the **refusal copy** — which
`registry.ts` marks per-jurisdiction *by explicit design* and which **must not be standardised**.

### Q3 · ⚠ Which capabilities should NEVER be implemented because they solve only one city?
1. **An existing-building *entitlement* resolver.** Three independent stoppers (§F4). ⚠ Note the careful
   boundary: the *intervention ceiling* is a real 72.35 M m² opportunity — it is blocked on a **founder
   ADR and a missing legal datum**, not on engineering, and it must not be smuggled in as an envelope.
2. **Zoning-raster vectorisation.** **D-002, explicit.** The premise was measured false; the output would
   fail ADR-0283 before it existed. A letter to a publisher, not a sprint. It must **not** migrate back to
   `Engineering`.
3. **Exhaustive referenced-plan corpus admission.** ~0.006 % of buildable land per plan. The heavy-tailed
   size-ranked queue inside K10 is fine; the exhaustive programme never pays.
4. **A second street-width solver.** The core is already region-agnostic — the mistake
   `resolveMurciaStreetWidth.ts` explicitly declined to make (*"NOT A SECOND SOLVER"*). Only the source
   adapter and the band table are per-city.
5. **A street-network-polygon alignment proxy.** Measured dead (§D3).
6. **Any further dissolve work as a coverage lever.** Refuted at scale in two lineages; 0.54 M m² total, and
   published `manzana` geometry now outranks it.

### Q4 · ⚠ Which current investigations should STOP because they have low national value?

Said plainly, as asked, even where it kills live work.

| Live investigation | Verdict | Grounds |
|---|---|---|
| **Madrid — existing-building evidence chain** | ⛔ **STOP as an envelope programme. RE-SCOPE to a one-page ADR proposal.** | It cannot produce a publishable **envelope** on any branch (§F4). But it has surfaced the largest drawable-volume opportunity in Spain, and what that needs is a **founder decision on whether an intervention ceiling is a product**, plus the honest statement that its binding ceiling (existing GFA) is **not obtainable municipally**. **Redirect the agent to SIG-M1's review artefact (P-001) — same city, 41.7 M m², the highest-ROI item on the board.** |
| **Córdoba — Layer-2 / CUS recovery** | ⛔ **STOP the recovery. The two live items are now ALREADY DONE or nearly.** | D-002 forbids vectorisation; the search is CLOSED one-shot. ⭐ `114cf11d` has since delivered the two things that mattered: the block ring is **recovered from published data** and the front alignment is **solved by adjacency**, so blockers 3+4 have **no data dependency** and 8 of 9 ordinance inputs are supplied. What remains is **1.702 %** of the city, classified `Engineering` — finish that and stop. The `sup_viales` avenue is measured dead. |
| **Murcia — derived-variable inventory** | ⚠ **DE-PRIORITISE to two items, then stop.** | The city's remaining derivable work is worth **≤ +0.36 pp**. ⭐ But it has produced the single most valuable *national* correction of the week — Art. 4.5.3/4.5.4, which **refutes the universality of ADR-0285's test 2**. Keep exactly two things: (a) fix the two measured width defects (both **under-grant**); (b) query `eje_comercial`, which is worth 0.7 pp and whose consumer parameter **already exists in our code**. Then treat Murcia as a **reference implementation, not a target**. |
| **València — input-status matrix** | ✅ **CONTINUE, narrowed to one row.** | ⭐ It has already produced two national results: `Data unavailable` is now **0.00 %**, and `altura` gates **85.5 %, not 100 %** — 9.22 pp is dual-blocked or blocked by **our own unread chapters**, which is *our* work, not the municipality's. `explicit-area` is already the rule kind, so no solver is owed. The one remaining `Engineering` row is blocker 4 (the live `origen` read, ~1 day): **+0 envelopes**, but it upgrades a third of the city from *"we have no rule"* to *"the law delegates this."* Everything else on that board is External authority. |

**The uncomfortable summary**: three of four live city agents are working on land that engineering cannot
unlock — and **all four have nonetheless produced national corrections this week that no capability
analysis would have found.** The right move is not to disband them; it is to **re-scope them from city
completion to variable resolution**, which is exactly what the founder's reframing asks.

### Q5 · Which should be accelerated because they unlock multiple municipalities?
1. **K2 / Stage 0** — three measured strikes; every future city pays the same tax until it exists.
2. **K1's review artefact (P-001)** — converts a per-city unknown into a bounded cost for 8,132.
3. **K3 layers 2+3** — without it, KPI 3 cannot be measured and capability reuse stays a convention.
4. **K4**, starting with the four CCAA holding 60 % of the SEED tier.
5. **K7's terrain input** — legal half closed, code written, source national and free, wiring is two config
   values. It protects every envelope already drawn.
6. **The structured-parameter-sheet probe** — one reported region publishes `NP`/`HR`/`O`/`PM` + setbacks
   as a typed sheet one hop from the zoning polygon, across **67 municipalities with no transcription
   cost**. ⚠ **Unverified since 2026-07-26**, and that survey is stale in 2 of 11 rows (§12). Highest
   information per hour on this page; **probe before funding**.

---

## 11 · THE MEASURED DECOMPOSITION (every figure cited)

| City | Denominator | m² | Comparable? |
|---|---|---:|---|
| Barcelona | L-656 private buildable | 31,794,683 | ✅ live AMB Refós census, 2026-08-01 |
| Murcia | L-656 private buildable | 75,145,000 | ✅ |
| València | L-656 private buildable | 18,696,000 | ✅ re-derived server-side, agrees within 0.2 pp |
| Madrid | **Norma-Zonal-GOVERNED** | 149,577,170 | ⚠ **SUBSTITUTED upper bound** — `PG_ORDENACION/4` is polyline+`OBJECTID` only (V18) |
| Córdoba | **SUELO URBANO** | 33,341,928 | ⚠ upper bound — includes public systems; every share is a LOWER bound |

**ECC today**: Barcelona 58.93 % (18.74 M) · Murcia 28.03 % (21.06 M) · Madrid 11.695 % (17.49 M, **render
unconfirmed**) · València 0 % · Córdoba 0 % ⇒ **57.3 M m² = 18.6 %**.

**Madrid by legal computation mode** (`2a096355`, answering P-004): envelope 27.85 % · existing-building
48.38 % · instrument 12.08 % · explicit-area 11.70 %. The 48.38 + 12.08 reconciles exactly to NZ-3's
60.458 % (D-001).

**Undrawn, by root cause** — Madrid NZ-3 90.43 M (Legal, terminal) · Murcia delegation 50.35 M (Legal) ·
Córdoba no calificación 31.49 M (Data, **D-002**) · Madrid 23 packed zones 41.65 M (External authority,
**SIG-M1**) · València PGOU-ordered 11.89 M (External authority, **D-004**) · Barcelona terminal families
12.02 M (Legal) · València delegation 6.81 M (Legal) · Murcia width residual 3.73 M (mostly ADR-0287
terminal) · Córdoba engineering 0.567 M · Barcelona dissolve + selector 1.03 M · Córdoba delegated/
preservation 0.99 M.

---

## 12 · WHAT I COULD NOT MEASURE

- **8,127 of 8,132 municipalities are unmeasured.** National claims rest on `RATE.md` (2026-07-24),
  `README.md` + `seed_counts_by_ccaa.csv` (live region tiering, 2026-07-20), and
  `ES-CITY-ENVELOPE-CERTIFIABILITY-SURVEY.md` — ⚠ **which is stale in both directions**: it rates one city
  *"PDF-ONLY, no build until a queryable backend appears"* while that city now draws **28.03 %**, and rates
  another *"✅ VERIFIED computable"* while it measures **0.0 %** (the survey generalised a 2-district pilot,
  14.9 % of the city, to the whole). **Do not sequence a national plan from it without re-probing.**
- **Two of five denominators are non-comparable upper bounds.** The 18.6 % aggregate is an ordering aid,
  **not a national coverage figure**.
- **The structured-parameter-sheet lead is unprobed since 2026-07-26** and is the largest conditional claim
  here.
- **Murcia's Arts. 4.5.3/4.5.4 are reported by the Murcia agent, not verified by me** — I did not find them
  in the repo corpus. They are load-bearing for the ADR-0285 correction and should be confirmed against the
  filed PDF (SHA-256 `ab71c651…`) before the ADR is amended.
- **Madrid's SIG-M2 render is unconfirmed** — the evidence register's own next action is *"Confirm the
  SIG-M2 flip renders; publish MEASURED share."*
- **The instrument heavy-tail is measured in one city only** (169 → 106 → 26 carry 80 %). Whether it holds
  elsewhere decides whether K10's selective-admission path is nationally viable, and it is the cheapest
  remaining unknown that would change a strategy.
- **Airport, flood and infrastructure constraints are entirely unmodelled and entirely unmeasured.** They
  constrain **downward**, so their absence can only **over-state**. No city record quantifies them. That is
  the largest unexamined correctness exposure in this document.
