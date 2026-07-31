# SOURCE — Founder: Rule Resolution Engine + How Madrid Compounds Across Spain (raw capture)

> **Provenance.** Founder-provided research, delivered 2026-07-31 (batches 10–11, two messages).
> Captured **verbatim** in §A–§B. §C is mine and is marked as such.
>
> ⚠ **Scope note.** Batch 10 is cross-jurisdiction platform architecture (see C-26 in the companion
> ontology capture — its natural home is the planning-regime resolver docs, not Madrid). Batch 11 is
> **Spain-wide**, and its natural home is `jurisdictions/es/` country level, not Madrid. Both filed
> here to keep the capture with its delivery context; the cross-references are a follow-up I have not
> yet written.
>
> Companion captures: [`…-recon`](./SOURCE-founder-madrid-recon-2026-07-31.md) ·
> [`…-roadmap`](./SOURCE-founder-madrid-roadmap-2026-07-31.md) ·
> [`…-feasibility`](./SOURCE-founder-madrid-feasibility-2026-07-31.md) ·
> [`…-execution-plan`](./SOURCE-founder-madrid-execution-plan-2026-07-31.md) ·
> [`…-planning-graph`](./SOURCE-founder-madrid-planning-graph-2026-07-31.md) ·
> [`…-spanish-compiler-and-planning-ontology`](./SOURCE-founder-spanish-compiler-and-planning-ontology-2026-07-31.md)

---

## §A — Batch 10: Step 5, the Rule Resolution Engine

> **Everything so far assumes that planning rules are static. They are not.**
>
> This is probably the single biggest difference between an academic extraction project and software
> that planners can actually rely on.

### The problem — a parcel rarely has one rule

```
Parcel → Norma Zonal 4 → Grade 2 → Historic Centre → Protected Building
       → APR → Street Alignment → Specific Plan → Temporary Suspension → Building Condition
```

Each layer can change height, setbacks, coverage, FAR, permitted uses.

> The question is no longer *"What is the height?"* The question becomes **"Which height wins?"**
> That is a rule-resolution problem.

Most systems produce `height → 22 m` or `height → unknown`. **That is insufficient.**

### Resolution tree

```
Candidate Rules → Resolution → Winning Rule → Explanation
```

| Candidate | Value | Priority | Source |
| --------- | ----: | -------: | ------ |
| A | 22 | 100 | NZ4 |
| B | 18 | 300 | Historic Centre |
| C | **24** | **500** | **APR** |

Winner: **24**, with explanation *"APR overrides NZ4."*

> This is why the applicability graph matters. Rules become nodes, overrides become edges —
> `APR OVERRIDES NZ4`. **No hardcoded logic.**

### Generic priority model — each jurisdiction maps its own legal hierarchy; the engine is unchanged

```
European Directive 1000 → Regional Plan 900 → Municipal Plan 800 → Zone 700
→ Grade 600 → Protection 500 → Parcel-specific 400 → Building-specific 300
```

**Madrid's chain:**

```
Temporary suspension → Special Plan → APR → APE → API
→ Norma Zonal → Grade → Level → General rules
```

> Notice: **this is data. Not code.**

### Parameter-level resolution — *"Important. Do NOT resolve whole rules."*

> Resolve **parameter by parameter.** APR may override *Height* but not *Coverage*. Result:
> `Height ← APR`, `Coverage ← Norma Zonal`. **This happens constantly in planning law.**

### Exceptions — represent explicitly, not as code

Instead of `if corner …`, store an **Exception Rule**: `Height 22`, exception `Corner parcel → 26`.

### Conditions

`Height 22 when Zone=4` · `Height 18 when ProtectedBuilding`

### Temporal rules & amendments

Every rule carries `effectiveFrom` / `effectiveTo`. Instead of *replacing* Article 8.4, store
`Article → Amendment → Current text`. **Every value keeps provenance. No data duplication.**

### Confidence — **"Resolution should never increase confidence."**

> If `Height = Unknown`, resolution **cannot** produce `22`. **Unknown remains unknown.**

### Explainability & API

```
Maximum height 24 m — because APR Article XX overrides Norma Zonal Article YY
```

```typescript
resolveParameter(parcel, MaximumHeight)   // not getHeight(parcel)
```

The same resolver works for height, FAR, setbacks, coverage, uses.

### Why Madrid suits this

> Madrid already exposes much of the legal applicability through GIS: **Norma Zonal** (base rule set),
> **Ámbitos APR/APE/API** (higher-priority instruments), **protected buildings** (heritage),
> **uses** (separate but joinable), **building-condition layers** (parcel-specific geometry).
> **Many cities require inference to discover this hierarchy. Madrid publishes much of it explicitly.**

### The five components

1. **GIS classifier** — determine what planning objects affect a parcel
2. **Legal compiler** — official legal text → structured parameters with citations
3. **Applicability graph** — connect parcels, planning objects, articles, parameters
4. **Planning ontology** — normalize concepts across jurisdictions
5. **Rule resolution engine** — determine which legally applicable rule governs each parameter

> **Long-term target:** *Given any parcel in a supported jurisdiction, the system can identify every
> applicable planning instrument, resolve conflicting rules according to the legal hierarchy, and
> return each buildability parameter together with its exact legal citation and provenance.*

---

## §B — Batch 11: how Madrid influences the next Spanish city

> If Madrid were just a one-off extraction, the next Spanish city would cost almost the same effort
> again. If you build the intelligence layer correctly, the **second Spanish city is dramatically
> cheaper**, and by the fifth or sixth you're mostly configuring data sources rather than doing research.

### The recurring Spanish planning pattern the engine learns

```
Norma Zonal → Grado → Nivel → Edificabilidad → Altura → Ocupación → Retranqueos → Usos
```

### The Spanish Planning Ontology

| Spanish term | Canonical concept |
| ------------ | ----------------- |
| Edificabilidad | `MaximumFAR` |
| Ocupación | `MaximumCoverage` |
| Altura | `MaximumHeight` |
| Número de plantas | `MaximumFloors` |
| Retranqueo | `Setback` |
| Fondo edificable | `BuildableDepth` |
| Alineación | `AlignmentRule` |
| Uso característico | `PrimaryUse` |
| Uso compatible | `CompatibleUse` |
| Protección | `HeritageConstraint` |
| Planeamiento incorporado | `DerivedPlan` |

> Once mapped, every future city reuses them.

**Valencia** publishing *Zona Eixample* with *Altura máxima 24 m · Ocupación máxima 70% ·
Edificabilidad 3 m²/m²* needs **no new ontology work — only extraction.**

**Bilbao** may use *Aprovechamiento urbanístico* instead of *Edificabilidad* →
**one mapping, reusable forever.**

### GIS intelligence transfers even faster

> Most Spanish municipalities use ArcGIS. Many use similar planning schemas.

Common field/layer signals: `CALIFICACION`, `ZONIFICACION`, `ORDENANZA`, `NORMA`, `AMBITO`.

**The Spanish GIS discovery engine** — input an ArcGIS REST endpoint, output by field heuristics:

```json
{ "zoneLayer":"…", "ambitoLayer":"…", "alignmentLayer":"…", "protectionLayer":"…" }
```

> `AMB_TX_ETIQ` was enough to identify zoning in Madrid. Future cities will have similar signals.

### Derived-plan intelligence transfers — same ontology, different names

| City | Instrument names |
| ---- | ---------------- |
| Madrid | `APR`, `APE`, `API` |
| Barcelona | `PMU`, `PEU`, `MPGM` |
| Valencia | `PRI`, `PEPRI` |
| Bilbao | `PERI` |

> The broader concept: `General Plan → Special Plan → Override`. **Every Spanish city has some version.**

### Extraction model improves

> Instead of `PDF → LLM → guess`, you get `PDF → Spanish planning parser → structured rules`.
> **Huge accuracy gain.**

### Estimated effort reduction

| City | Without Madrid intelligence | With Madrid intelligence |
| ---- | --------------------------: | -----------------------: |
| Madrid | 100 | 100 |
| Valencia | 100 | 30 |
| Bilbao | 100 | 25 |
| Zaragoza | 100 | 20 |
| **Total** | **400** | **175** |

> **More than 50% reduction.**

### Cities with very high transferability

Madrid · Valencia · Zaragoza · Sevilla · Málaga · Murcia · Valladolid · Alicante · Córdoba · Bilbao

> because they generally follow the Spanish planning tradition:
> `General Plan → Urbanistic Ordinances → Zoning → Grades → Uses → Parameters`

### What Madrid should produce — **reusable components, not a dataset**

1. **Spanish Planning Ontology** — `MaximumHeight`, `MaximumCoverage`, `MaximumFAR`, `Setback`, `BuildableDepth`, `Use`, `Protection`
2. **Spanish GIS Classifier** — find zoning / protection / special-plan layers
3. **Spanish Legal Parser** — Article, Paragraph, Table, Exception
4. **Spanish Rule Resolver** — General Plan → Special Plan → Protection → Parcel Rule
5. **Spanish Citation Engine** — value → article → paragraph → document

> If Berlin becomes the German archetype and Madrid the Spanish archetype, Madrid is not just one city
> — it becomes the foundation for a **Spanish planning intelligence layer**:
> `New Spanish city → Connect GIS → Run discovery → Extract ordinance → Map to ontology → Produce
> buildability rules`. Instead of a 6–12 month research project per city.

---

## §C — Capture notes (MINE, not the founder's)

### C-27 — "Resolution should never increase confidence" is the single best line in the corpus

Batch 10's rule — *if `Height = Unknown`, resolution cannot produce `22`; unknown remains unknown* —
is the **L-616 invariant applied to a stage nobody had considered**. Every prior honesty rule in this
corpus governs *extraction*. This one governs *resolution*, which is where the laundering would
actually happen: a resolver that picks "the best available candidate" will happily promote an
unsourced default into a confident answer, and every upstream `null` discipline is defeated silently.

Same shape as the Denmark rule shipped this session — a `derived` band may not claim a published
byggefelt hole, because that launders a study into plan geometry. **This belongs in the shared
contract, not in a Madrid rule pack.**

### C-28 — Parameter-level resolution is correct and is a real constraint on the schema

*"APR may override Height but not Coverage"* means resolution granularity is **per parameter**, not
per rule. Any schema storing a rule as an atomic record with one priority cannot express this. It
also compounds with the grade-inheritance requirement (C-15) and the exception trees (batch 5 §13.5):
the resolved value for one parameter may come from a different instrument, at a different priority,
under a different condition, than its neighbour in the same "rule".

This is a genuine argument for the graph — and equally a warning that the graph is **not** a
convenience layer over flat JSON. It changes what the storage model must be able to represent.

### C-29 — The effort-reduction numbers are a hypothesis, and PRYZM has counter-evidence

`400 → 175` (Valencia 30, Bilbao 25, Zaragoza 20) is presented without derivation. The *direction* is
almost certainly right — reuse compounds. The *magnitude* is unverified, and two items on the
"very high transferability" list are ones PRYZM already knows are harder than the list implies:

- **Barcelona** — `edificabilitat` is a **CONSTRUCTION, not a lookup** (ADR-0271; Art. 242.2 is an
  algorithm). A vocabulary map `edificabilidad → MaximumFAR` would read it as a value and be wrong,
  silently. Barcelona is also *not* on batch 11's transferability list despite being on batch 7's
  compiler list — worth noting the founder may already sense this.
- **Córdoba** — appears on the high-transferability list, but Madrid/Córdoba are recorded as blocked
  by **DISSOLVE, not rules**. Ontology reuse does not touch that blocker at all.

Neither invalidates the strategy. They mean the reduction applies to the *legal-vocabulary* axis and
**not** to the geometry/data axes, which is where at least two Spanish cities are actually stuck.
An honest restatement: **effort reduction is real for legislation, unproven for geometry.**

### C-30 — Net-new reference data worth extracting from this batch

Two items are directly usable and were not recorded anywhere in the repo before:

1. **Derived-plan instrument names per Spanish city** — Madrid `APR/APE/API`, Barcelona
   `PMU/PEU/MPGM`, Valencia `PRI/PEPRI`, Bilbao `PERI`. This is a concrete routing table for the
   refusal path in four cities, not a strategy claim.
2. **Spanish GIS field-heuristic signals** — `CALIFICACION`, `ZONIFICACION`, `ORDENANZA`, `NORMA`,
   `AMBITO`, plus Madrid's proven `AMB_TX_ETIQ` / `AMB_TX_DENOM`. Enough to prototype the discovery
   engine against a second city's ArcGIS root and measure the hit rate.

Both are cheap to verify and would be the fastest empirical test of batch 11's whole thesis.
Recommend they be lifted to `jurisdictions/es/` country level rather than left under Madrid.

### C-31 — The "next step" has now moved five times; this is the sequencing decision to make

Extending C-25 with batches 10–11:

| Batch | Claimed next step |
| ----- | ----------------- |
| 1–2 | NZ4 article extraction |
| 4–6 | `MadridProvider` + `MadridRuleSchema` + NZ4 template |
| 7 | **not** NZ4 by hand — build the Spanish compiler |
| 8 | applicability graph **before** extracting articles |
| 9 | ontology, or you'll redesign the data model |
| **10** | **rule resolution engine** — "the single biggest difference" |
| **11** | build Madrid as **reusable components**, not a dataset |

Every argument is individually sound; they cannot all be next. The corpus has escalated from
*"extract NZ4 from Chapter 8.4"* to *"build a European planning intelligence platform"* without a
decision point in between.

**My recommendation, unchanged from C-25 and now stronger:** make **NZ4 the forcing function**.
Extract one zone *through* the graph/ontology/resolver rather than into flat JSON. One zone is enough
to prove all five components against a real ordinance, and cheap to redo if the schema is wrong —
whereas 2,000 parameters or a full ontology built ahead of any validation is neither. This is exactly
how the Denmark placement resolver landed this session: vocabulary and first real consumer together,
with the engine untouched.

The counter-argument deserves stating fairly: if the schema **is** wrong, discovering it via NZ4 costs
a rework of NZ4. Batches 8–9 would say design it right first. But that trades a known small cost for
an unknown large one, and nothing in the corpus has yet been tested against an actual PGOUM article.

**This is the founder's call, and it is now the highest-value open decision in the Madrid work.**
