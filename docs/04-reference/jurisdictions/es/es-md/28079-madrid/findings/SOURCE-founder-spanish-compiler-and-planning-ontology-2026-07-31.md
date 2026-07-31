# SOURCE — Founder: Spanish Legal Compiler → Rule Applicability Graph → European Planning Ontology (raw capture)

> **Provenance.** Founder-provided research, delivered 2026-07-31 (batches 7–9, three messages).
> Captured **verbatim** in §A–§C. §D is mine and is marked as such.
>
> ⚠ **Scope note — this batch is not Madrid data.** It is a **platform architecture proposal** that
> uses Madrid as its first implementation. Filed under Madrid because that is where it arrived, but
> §D flags that its natural home is cross-jurisdiction (C63 / the planning-regime resolver), and it
> overlaps existing ratified PRYZM direction.
>
> Companion captures: [`…-recon`](./SOURCE-founder-madrid-recon-2026-07-31.md) ·
> [`…-roadmap`](./SOURCE-founder-madrid-roadmap-2026-07-31.md) ·
> [`…-feasibility`](./SOURCE-founder-madrid-feasibility-2026-07-31.md) ·
> [`…-execution-plan`](./SOURCE-founder-madrid-execution-plan-2026-07-31.md) ·
> [`…-planning-graph`](./SOURCE-founder-madrid-planning-graph-2026-07-31.md)

**Founder's thesis, quoted:**

> The next highest-impact step is **not extracting NZ4 by hand**. It is building the infrastructure
> that lets you extract **every Spanish jurisdiction** with the same pipeline.
> Berlin already demonstrated that a legal compiler works. **Madrid should become the first Spanish
> compiler.**

---

## §A — Batch 7: the Spanish Planning Legal Compiler

### Why it is realistic

> Spanish planning ordinances are **surprisingly standardized.** Almost every municipality uses
> variations of the same vocabulary.

| Concept | Typical wording |
| ------- | --------------- |
| FAR | *edificabilidad* |
| Coverage | *ocupación* |
| Height | *altura máxima* / *altura de cornisa* |
| Floors | *número de plantas* |
| Front setback | *retranqueo delantero* |
| Rear setback | *retranqueo posterior* |
| Side setback | *retranqueo lateral* |
| Buildable depth | *fondo edificable* |
| Alignment | *alineación oficial* |
| Permitted use | *uso cualificado* |
| Compatible use | *uso compatible* |

```
PDF → OCR/Layout → Section splitter → Zone classifier
    → Spanish planning vocabulary → Parameter extractor → Validator → JSON
```

> Berlin's pipeline already provides layout, citations, validation, JSON, confidence.
> **Madrid mainly requires replacing the legal vocabulary.**

### The ten modules

**M1 — Section splitter.** Teach the parser the Spanish planning hierarchy — deterministic:

```
Título → Capítulo → Sección → Artículo → Apartado
```
```json
{ "title":"VIII", "chapter":"8.4", "article":"8.4.12", "paragraph":"2", "text":"..." }
```

**M2 — Zone classifier.** `{"zone":"4","grade":"general"}` or `{"zone":"8","grade":"2","level":"a"}`

**M3 — Parameter extractor** — *"Instead of using regexes only, build parameter objects."*

| Input text | Output |
| ---------- | ------ |
| *La ocupación máxima será del 70 por ciento de la parcela.* | `{ "parameter":"coverage", "value":70, "unit":"%", "denominator":"parcel" }` |
| *La altura máxima será de 22 metros.* | `{ "parameter":"maxHeight", "value":22, "unit":"m" }` |
| *El retranqueo lateral mínimo será de tres metros.* | `{ "parameter":"sideSetback", "value":3, "unit":"m" }` |

**M4 — Citation engine** — *"where your pipeline becomes stronger than most planning databases."*

```json
{ "value":22, "citation":{ "article":"8.4.12", "paragraph":"2", "page":384 } }
```

> **Never separate data from provenance.**

**M5 — Scope extractor** — *"One thing almost every planning database gets wrong."*
`70% de la parcela` → `scope:"parcel"` · `sobre el ámbito` → `scope:"planning-area"` ·
unknown → `scope:null`

**M6 — Rule conflict detector.** Detect when later provisions override earlier ones:

```json
{ "status":"overridden", "overriddenBy":"Artículo 8.4.18" }
```

> **This avoids silently mixing incompatible rules.**

**M7 — Structured tables.** Convert tabular ordinance data directly, not via OCR-as-text:

```json
[ { "grade":"1", "height":22, "floors":6 },
  { "grade":"2", "height":28, "floors":8 } ]
```

**M8 — Legal dictionary** — `SpanishPlanningDictionary.json`, *"Reusable nationally"*, mapping
*edificabilidad*→`far`, *ocupación*→`coverage`, *altura de cornisa*/*altura máxima*→`height`,
*número de plantas*→`floors`, *fondo edificable*→`depth`, *retranqueo*→`setback`,
*uso cualificado*→`primaryUse`, *uso compatible*→`compatibleUse`.

**M9 — Confidence engine** — four levels only:

```
PRIMARY_EXACT → PRIMARY_TABLE → PRIMARY_TEXT → UNKNOWN
```

> **Never output `estimated` or `probably`.**

**M10 — Madrid integration.** *"The compiler doesn't need GIS. GIS chooses the rule."*

```
Coordinate → Norma Zonal GIS → Zone code → Compiler → Rule JSON
```

### Expected coverage after the compiler

| Dataset | Before | After |
| ------- | -----: | ----: |
| Zone routing | 100% | 100% |
| Articles | 30% | 100% |
| FAR | 30% | 90% |
| Height / Floors / Coverage / Setbacks | 0% | 90% |
| Uses | 40% | 95% |

> **This work is not just for Madrid.** Once you have a Spanish section parser, planning dictionary,
> citation extractor, parameter extractor, and validation rules, you have the core infrastructure for
> many municipalities. The same compiler can be adapted to **Barcelona, Valencia, Zaragoza, Málaga,
> Bilbao, Seville** with comparatively small jurisdiction-specific additions.
>
> Berlin gave you a **German legal compiler**. Madrid is the opportunity to build a **Spanish legal
> compiler**, which becomes the foundation for scaling across Spain rather than solving one city at a time.

---

## §B — Batch 8: the Rule Applicability Graph

> This is the difference between a **document database** and a **buildability engine**.
>
> A planner does not read the entire PGOUM. They answer: **"Which articles apply to THIS parcel?"**
> Your engine should do exactly the same.

```
Parcel → GIS → Zone → Applicable articles → Applicable parameters → Engine
```

### The chain of legal constraints

```
Parcel → Norma Zonal → Grado → Nivel → Ámbito → Protection
       → Specific Plan → Building Conditions → Uses → Articles
```

> Represent this as a **graph** rather than a flat JSON.

### Why Madrid is unusually suited

GIS already provides most of the graph — `coordinate → NORMAS_ZONALES → AMB_TX_ETIQ → Zone`,
`coordinate → PG_ORDENACION → TIPOAMB → APR/API/APE`, and
`coordinate → CONDICIONES → CODMANZANA → NUMORD`.

> This is almost the legal routing graph. **Very few European cities expose this.**

### Nodes and edges

```json
{ "id":"NZ4",   "type":"Zone", "name":"Norma Zonal 4" }
{ "id":"8.4.12","type":"Article" }
{ "id":"height","type":"Parameter" }
```

```
NZ4 —HAS_ARTICLE→ 8.4.12 —DEFINES→ Height —HAS_VALUE→ 22m
                                   Height —HAS_SOURCE→ Article 8.4.12
```

> Suppose Madrid changes one article. Instead of rebuilding everything, **you replace one node.**
> Everything downstream updates automatically.

### Override engine — priority, not special-case code

```json
{ "value":22, "priority":100 }    // NZ4
{ "value":28, "priority":500 }    // APR.17.03
```

> Highest priority wins. **No special code.**

### Applicability conditions make the engine generic

Store `Height 22m when Zone=4`, `Setback 5m when Zone=8` — not bare values.

### GIS becomes a classifier, not a parameter source

### Generic interface — the engine should not know which country it is evaluating

```typescript
interface ApplicableRuleProvider {
  resolveRules(parcel): RuleSet
}
```

`BerlinRuleProvider` and `MadridRuleProvider` produce **exactly the same output**.

### Explainability comes almost for free

```
Maximum height: 22 m
Reason: PGOUM-97, Article 8.4.12, Paragraph 2
Applicable because: Norma Zonal 4 — parcel intersects NZ4 polygon.
```

> A major advantage for planning officers and developers because every computed result is directly traceable.

### Coverage with this architecture

| Component | Coverage |
| --------- | -------- |
| GIS classification | 100% |
| Legal routing | 100% |
| Rule applicability | 95% |
| Article provenance | 100% |
| Explainability | 100% |
| Maintainability | Very high |

### Why prioritize the graph *before* extracting every article

> If you extract 2,000 legal parameters into flat JSON and later discover Madrid introduces a new
> override layer (or another city has different precedence rules), you'll need to **redesign the data
> model.** If you first build the applicability graph, every new parameter/article/override is just
> another node or edge, and every new municipality reuses the same architecture. **The extraction work
> becomes incremental rather than requiring structural changes.**

---

## §C — Batch 9: the Planning Ontology

> The step that turns the project from a **rule extraction system** into a **digital twin of the
> planning code** — and the step that will likely distinguish your engine from anything currently available.

### Why JSON fields don't scale

Different words, same concepts:

| Germany | Spain | Belgium | France |
| ------- | ----- | ------- | ------ |
| GRZ, GFZ, Traufhöhe, Firsthöhe, Baugrenze, Baulinie | Edificabilidad, Ocupación, Altura, Retranqueo, Alineación | Bouwdiepte, Kroonlijsthoogte, Bouwhoogte | Emprise au sol, Hauteur, Prospect |

Instead of `{"ocupacion":70}` store
`{ "type":"MaximumCoverage", "value":70, "unit":"%", "scope":"parcel" }` — now Spain, Germany and
Belgium all produce **exactly the same object**.

### The ten ontology layers

| Layer | Contents |
| ----- | -------- |
| **1 — Legal concepts** | `MaximumHeight`, `MaximumCoverage`, `MaximumFAR`, `MinimumSetback`, `MaximumDepth`, `AlignmentRule`, `PrimaryUse`, `CompatibleUse`, `ProtectedBuilding`, `DerivedPlan`, `StreetAlignment`, `BuildableEnvelope` — **not jurisdiction-specific** |
| **2 — Jurisdiction vocabulary** | *ocupación* → `MaximumCoverage` · `GRZ` → `MaximumCoverage` · *bebouwingspercentage* → `MaximumCoverage`. The engine only understands `MaximumCoverage` |
| **3 — Measurement** | `Height = 22` **means nothing.** `{ "type":"MaximumHeight", "value":22, "unit":"m", "measurement":"cornice" }` vs `"measurement":"ridge"` are **different legal concepts** |
| **4 — Scope** | `Coverage = 70%` is incomplete; needs `scope: parcel \| planning-area`. FAR `2.0` → `{ "value":2, "scope":"parcel", "unit":"m²/m²" }` |
| **5 — Applicability** | `{ "parameter":"MaximumHeight", "value":22, "appliesWhen":{ "zone":"4" } }` |
| **6 — Source** | every parameter **always** carries `{ "source":{ "document":"PGOUM", "article":"8.4.12", "paragraph":"2" } }` — the ontology **requires** provenance |
| **7 — Confidence** | `PrimaryStructured`, `PrimaryTable`, `PrimaryText`, `PrimaryGIS`, `SecondaryDerived`, `Unknown` — **no percentages**; the engine understands provenance quality |
| **8 — Geometry** | distinguish `Parcel`, `PlanningBlock`, `Alignment`, `BuildableEnvelope`, `SetbackLine`, `ProtectedArea`, `DerivedPlanArea`, `ZoneBoundary` — not just "Polygon" |
| **9 — Rule** | `Constraint → MaximumHeight`; `Alignment → MandatoryAlignment`; `Setback → MinimumFrontSetback`; `Coverage → MaximumCoverage` |
| **10 — European** | *edificabilidad* / `GFZ` / *vloerindex* → `MaximumFAR`; *coefficient d'emprise* → `MaximumCoverage`. **The engine becomes multilingual automatically** |

### Madrid as the ontology test case

> Madrid is ideal because it contains almost every planning concept: zoning ✓ grades ✓ levels ✓
> alignment ✓ setbacks ✓ FAR ✓ coverage ✓ uses ✓ protected buildings ✓ derived plans ✓ explicit
> buildable envelopes ✓. **Very few cities expose such a rich combination.**

### Final architecture

```
Official GIS → Applicability graph → Legal compiler → Planning ontology
             → Canonical rules → European buildability engine
```

> If you stop at extracting Madrid into JSON, you'll eventually have **dozens of incompatible schemas
> and special cases.** If you invest in GIS classifier → legal compiler → rule applicability graph →
> planning ontology, then adding a jurisdiction is mostly: connect its official GIS, map its legal
> vocabulary to the ontology, extract article-backed parameters. **The engine, validation,
> explainability, provenance, and API remain unchanged.**

### Realistic end-state

| Capability | Berlin | Madrid | Reusable across Europe |
| ---------- | -----: | -----: | ---------------------: |
| Official GIS routing | ✅ | ✅ | ✅ |
| Legal article extraction | ✅ | ✅ | ✅ |
| Citation-backed parameters | ✅ | ✅ | ✅ |
| Rule applicability graph | ✅ | ✅ | ✅ |
| Canonical planning ontology | ✅ | ✅ | ✅ |
| Explainable buildability decisions | ✅ | ✅ | ✅ |

> At that point you're no longer building a Madrid parser — you've built a **general planning
> intelligence platform** where Madrid is one jurisdiction implemented on top of a common, legally
> grounded architecture.

---

## §D — Capture notes (MINE, not the founder's)

### C-22 — This overlaps ratified PRYZM direction that already exists — check before building

Batches 8–9 are **not greenfield**. Two existing PRYZM workstreams cover much of this ground, and the
founder's proposal appears to have been developed without reference to them:

| Founder's proposal | Existing PRYZM position |
| ------------------ | ----------------------- |
| §B override engine — priority-ranked, highest wins, "no special code" | **Planning-regime resolver**: geometry-first, **instrument-priority** resolver — already the ratified cross-jurisdiction design |
| §B rule applicability graph | **Spatial knowledge graph** — same memory item; also the **resolution-STRATEGY data model** |
| §B "routing" vs "parameters" as separate completeness axes | Already decided: **split routing-vs-numeric completeness in the C63 LEGISLATION axis** |
| §C planning ontology / canonical concepts | **Unified Building Graph** strategy — the identified gap was *one* `@pryzm/building-graph`, not a second parallel graph |
| §A M9 confidence bands | C63 SRC axis + the Denmark `FetchOutcome` / proven-bindingness pattern shipped this session |

**This is convergence, not conflict** — an independent pass arriving at the same architecture is
corroboration that the architecture is right. But it means the correct next action is
**reconcile, not implement**. Building a second graph/ontology alongside the existing planning-regime
resolver would be exactly the "dozens of incompatible schemas" outcome §C warns against — arrived at
from the other direction.

### C-23 — The strategic claim in §A is testable *now*, and cheaply

§A's core bet — *"Spanish planning ordinances are surprisingly standardized"*, so one compiler serves
Barcelona/Valencia/Zaragoza/Málaga/Bilbao/Seville — is the highest-value claim in the entire corpus,
because it converts per-city cost into per-country cost.

It is also **unverified**. And PRYZM has direct counter-evidence worth weighing:

- **Barcelona's `edificabilitat` is a CONSTRUCTION, not a lookup** (ADR-0271) — Art. 242.2 is an
  *algorithm*. A vocabulary-mapping compiler that expects `edificabilidad → far` as a value lookup
  would produce a wrong number for Barcelona, silently.
- **Madrid NZ-1 is ring-only by decision** — deliberately not computed, because *ficha* case law is
  not an engineering gap.
- **Spain scaling is blocked by DISSOLVE, not rules** for Madrid/Córdoba; and **street width has no
  national source and must be CONSTRUCTED**.

So "the same vocabulary" is true at the *term* level and demonstrably false at the *semantics* level
for at least one major Spanish city. The compiler is still likely worth building — but the honest
framing is **"one compiler + per-city semantic adapters"**, not "one compiler". Test it against
Barcelona's Art. 242.2 early, because Barcelona is the one Spanish city where we already know the
ground truth and can measure the compiler's answer against a shipped implementation.

### C-24 — §C Layer 3 (measurement) is the same defect PRYZM has already been bitten by

*"`Height = 22` means nothing"* and the cornice-vs-ridge distinction restates **L-584**
(terrain/*rasant* is a **legal** defect) and batch 5's `referencePlane: "rasante_oficial"`. Three
independent arrivals at the same requirement across this session.

Still incomplete in all three: they name the *measurement datum* but not the *sampling rule along it*.
L-584's actual failure was sampling one point at the block centroid where the ordinance measures at
the **façade**. An ontology that records `measurement: "cornice"` and `referencePlane: "rasante"` and
stops there would **still reproduce L-584 exactly.** If this ontology is built, the sampling rule must
be a first-class field.

### C-25 — Sequencing tension the founder has not resolved

Across nine batches the "highest-value next step" has moved four times:

| Batch | Claimed next step |
| ----- | ----------------- |
| 1–2 | NZ4 article extraction (P0, "largest") |
| 4–5 | `MadridProvider.ts` + `MadridRuleSchema` + NZ4 spec |
| 6 | `madrid_legal_extractor_v1` + NZ4 template |
| **7** | **"not extracting NZ4 by hand"** — build the Spanish compiler |
| **8** | build the applicability graph **before** extracting articles |
| **9** | build the ontology, or you'll redesign the data model later |

Each argument is individually sound and they are in genuine tension: batches 8–9 argue for
architecture-first (avoid a costly redesign), batches 1–6 for extraction-first (NZ4 delivers 30–40%
of Madrid residential in 2–3 weeks). Both cannot be the next step.

**My read, offered as a recommendation not a decision:** the tension resolves if NZ4 is treated as the
*forcing function* for the architecture rather than as competing with it. Extract NZ4 **through** the
graph/ontology, not into flat JSON — one zone is enough to prove the schema and far cheaper to redo
than 2,000 parameters. That satisfies §B's warning (no flat-JSON lock-in) without paying for a full
ontology before anything is validated against a real ordinance. It also matches how the Denmark
placement resolver was built this session: the vocabulary and the first real consumer landed together.

### C-26 — Filing note

§B and §C are **not Madrid-specific** and will be mis-shelved here long-term. Their natural homes:
the planning-regime resolver / knowledge-graph docs, `docs/02-decisions/contracts/` (C63 legislation
axis), and the Envelope Replication Standard (ADR-0279) — which is already accumulating evidence that
S4's internal structure is jurisdiction-shaped (Denmark's per-parcel placement resolver; Madrid's
grade inheritance, C-15). Left here for now so the capture stays with its delivery context; a
cross-reference from the cross-jurisdiction docs is the right follow-up, and I have not written one yet.
