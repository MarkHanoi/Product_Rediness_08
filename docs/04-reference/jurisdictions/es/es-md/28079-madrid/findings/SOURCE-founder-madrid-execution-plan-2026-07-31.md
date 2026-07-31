# SOURCE — Founder Madrid Execution Roadmap: Berlin-Pipeline Reuse, Backlog & Risk Controls (raw capture)

> **Provenance.** Founder-provided research, delivered 2026-07-31 (batches 4 and 5, three messages).
> Captured **verbatim** in §A–§C. §D is mine and is marked as such.
>
> **This batch answers a question the earlier ones only implied:** *can the Berlin pipeline be reused
> for Madrid?* The founder's answer is **~80% reusable / ~20% Madrid-specific**. That directly
> concerns the `packages/ordinance-extraction/` work in flight.
>
> Companion captures: [`…-recon`](./SOURCE-founder-madrid-recon-2026-07-31.md) ·
> [`…-roadmap`](./SOURCE-founder-madrid-roadmap-2026-07-31.md) ·
> [`…-feasibility`](./SOURCE-founder-madrid-feasibility-2026-07-31.md)

**Founder's headline, quoted:**

> **The Berlin pipeline approach is realistic for Madrid, but the architecture needs one
> modification: Madrid is not a "GIS-first everything" city like Berlin. It is a hybrid: GIS-native
> zoning + PDF-native legal parameters.**

> The target should **not** be 100% automated extraction. The realistic engineering target is:
> **95% machine-readable buildability coverage · 100% provenance · 100% refusal instead of guessing
> · 90–95% envelope computation for normal residential parcels.**

---

## §A — Batch 4a: Madrid vs Berlin architecture

### The structural difference

| Berlin | Madrid |
| ------ | ------ |
| `parcel → GIS zoning layer → Baugebiet → Bebauungsplan / BauNVO → structured parameters → solver` | `parcel point → Norma Zonal GIS → grado → PGOUM Chapter 8.x → legal parameters → solver` |
| Legal model relatively standardized: `GFZ`, `GRZ`, `FH`, `TH`, `Baugrenze` | — |
| **`zone → parameters`** | **`zone + grado + typology + article + exceptions → parameters`** |
| Extraction problem is mostly *mapping* | **Madrid requires a stronger rule compiler** |

### Phase 0 — data foundation (mostly solved): `MadridPlanningProvider.ts`

| Resolver | Source | Output | Status |
| -------- | ------ | ------ | ------ |
| **1 — Norma Zonal** | `NORMAS_ZONALES/MapServer/0` | `{ "zoneCode":"4", "grado":null, "designation":"NZ 4" }` | ✅ production ready, 100% |
| **2 — Derived plan detector** | `PG_ORDENACION` layer 3 | `{ "planningType":"APR", "code":"APR.17.03", "action":"REFUSE" }` | ✅ production ready |
| **3 — NZ1 footprint** | `PG_CONDICIONES_EDIFICACION` layer 6 | `{ "ruleType":"explicit-area", "geometry":{"type":"Polygon"}, "source":"municipal GIS" }` | ✅ GIS ready — blocked only by explicit-area solver branch |

### Phase 1 — legal extraction engine ("PGOUM Compiler")

> **Do NOT manually create JSON.**

```
Official PDF → PDF parser → Chapter splitter → Zone classifier
  → Parameter extractor → HUMAN VALIDATION → Rule JSON
```

**Extract only `Título VIII — Condiciones particulares de las zonas`:**

| Zone | Chapter |
| ---- | ------- |
| NZ1 | 8.1 |
| NZ3 | 8.3 |
| NZ4 | 8.4 |
| NZ5 | 8.5 |
| NZ7 | 8.7 |
| NZ8 | 8.8 |

**Do NOT extract directly into the engine — create intermediate legal objects:**

```json
{ "zoneCode":"4",
  "source":{ "document":"PGOUM-97 Compendio 2025", "article":"8.4.xx", "paragraph":"3" },
  "parameters":{
    "buildableDepth":{ "value":20, "unit":"m" },
    "height":{ "value":22, "measurement":"cornisa" },
    "floors":{ "value":6 },
    "coverage":{ "value":70, "unit":"%", "denominator":"parcel" } } }
```

### Per-field difficulty

| Field | Difficulty | Search terms |
| ----- | ---------- | ------------ |
| FAR | ⭐⭐⭐⭐ | *edificabilidad*, *coeficiente de edificabilidad*, *coeficiente Z*, *m² edificables* |
| Height | ⭐⭐ | *altura máxima*, *altura de cornisa*, *altura total* |
| Floors | ⭐⭐ | *número de plantas*, `B+5`, *Baja más cinco* |
| Coverage | ⭐⭐⭐ | *ocupación máxima*, *ocupación sobre parcela* |
| Setbacks | ⭐⭐⭐ | *retranqueo*, *separación a linderos*, *alineación* |

Worked FAR example: `coeficiente de edificabilidad neta 4,5 m2/m2` →
`{ "value":4.5, "unit":"m2/m2", "scope":"parcel" }`

### Human-in-the-loop — "the biggest difference from Berlin"

> **Do not trust LLM extraction alone.** `Extract → Confidence score → Human approval → Publish`

```json
{ "value":22, "confidence":0.96, "verified":true, "article":"8.4.10" }
```

### Effort & coverage progression

| Stage | Time | Coverage |
| ----- | ---- | -------- |
| Phase 1 GIS completion (already 90%) | 2–3 weeks | → ~50% |
| NZ4 | 2–3 weeks | 30–40% Madrid residential → **70–75%** |
| NZ8 | 1–2 weeks | 10–15% |
| NZ5/NZ7 | 2 weeks | → **85–90%** |
| NZ1 (COEF_Z + solver) | — | → **90–95%** |

### What prevents 100%

APR/API/APE special plans (→ refuse) · protected buildings (catalogue integration; Madrid exposes
protected-building datasets separately) · individual *fichas específicas* · administrative
interpretations (need versioned overrides).

### Final architecture

```
GIS → Parcel + Norma Zonal → Legal Rule Compiler → Normalized Rule DB → Envelope Engine
```

| Milestone | Coverage |
| --------- | -------- |
| GIS provider | 50% |
| NZ4 legal extraction | 75% |
| NZ8/NZ5/NZ7 | 90% |
| NZ1 explicit-area | 95% |
| special plans/refusals | **100% honesty** |

> **Madrid is a very feasible Tier-1 city. The engineering difficulty is comparable to Berlin, but
> the extraction layer is more important.**

---

## §B — Batch 4b: Berlin pipeline reuse assessment

> **Yes. Madrid is technically feasible and probably easier than Berlin in the GIS layer. The main
> adaptation is legal extraction, not infrastructure.**

### Feasibility matrix

| Component | Berlin equivalent | Madrid status | Feasibility |
| --------- | ----------------- | ------------- | ----------- |
| Parcel locator | GIS parcel service | Catastro + municipal GIS | ✅ solved |
| Zone classifier | Bebauungsplan / Baunutzungsplan | Norma Zonal GIS | ✅ solved |
| Rule source discovery | BauNVO + B-Plan PDFs | PGOUM NNUU | ✅ solved |
| Legal document download | official PDFs | available | ✅ solved |
| Chapter segmentation | German parser | **Spanish parser needed** | 🟢 easy |
| Numeric extraction | tables/articles | PGOUM structured articles | 🟢 feasible |
| Rule normalization | existing schema | **reusable** | ✅ |
| Envelope solver | existing engine | **needs explicit-area branch** | 🟡 engineering |
| Exceptions | Sondergebiete | APR/API/APE/fichas | 🟡 expected |

> GIS readiness **90–95%** · Legal extraction readiness **50–60%** · Combined today **~40%** ·
> After implementation **90–95% realistic**

### Architecture decision

> **Do NOT create a Madrid-specific pipeline.**

```
planning-engine → jurisdiction adapter → { Berlin, Madrid, Brussels, Barcelona }
```

Madrid becomes `MadridProvider` + `MadridLegalCompiler` + `MadridRuleRegistry`.

```
providers/madrid/gis/
    normaZonal.ts   condicionesEdificacion.ts   ambitos.ts   alineaciones.ts
```

### Vocabulary translation — "only change vocabulary"

| German | Spanish |
| ------ | ------- |
| `GRZ`, `GFZ`, `Traufhöhe`, `Vollgeschosse`, `Baugrenze` | *ocupación*, *edificabilidad*, *altura de cornisa*, *número de plantas*, *retranqueo*, *fondo edificable* |

```json
{ "edificabilidad":"farRatio", "ocupación":"coverage", "altura de cornisa":"maxHeight",
  "número de plantas":"maxFloors", "retranqueo":"setback", "fondo edificable":"buildableDepth" }
```

### Zone priority — **"Do NOT start with NZ1"**

| Priority | Zone | Reason |
| -------- | ---- | ------ |
| **1** | **NZ4** | dominant Madrid residential typology; clean parametric rule; alignment engine already exists |
| 2 | NZ8 | simple geometry (`parcel − front − side − rear`); high automation |
| 3 | NZ5 / NZ7 | similar; setback; parameter extraction only |
| **4** | **NZ1** | *"actually technically hardest despite GIS availability"* — needs `ExplicitAreaRule` + `solveExplicitArea(polygon)`; geometry already supplied |
| 5 | NZ3 | **Do not solve.** Keep `derived-plan` refusal. Berlin has the same concept. |

### Dataset layout

```
jurisdictions/madrid/
    sources/    PGOUM_COMPENDIO_2025.pdf
    extracted/  zona1.json  zona4.json  zona8.json
    registry.ts
```

Every number stores verification:

```json
{ "value":20, "verification":{ "status":"approved", "reviewer":"human", "sourcePage":243 } }
```

### Timeline

| Week | Work |
| ---- | ---- |
| 1 | GIS adapter — zones, grados, derived plans, NZ1 geometry |
| 2–4 | Legal extraction — NZ4, NZ8, NZ5, NZ7 |
| 5–6 | Validation — 100 NZ4 parcels + 100 NZ8 parcels, GIS result vs manual legal reading |
| 7–8 | Engine — explicit-area |

> **Madrid is not a data acquisition problem. It is a Berlin-style legal compilation problem.**
> Strategy: freeze GIS layer → reuse Berlin legal parser → add Spanish vocabulary + article
> classifier → prioritize NZ4 → NZ8 → NZ5/7 → add explicit-area solver → keep NZ3 and APR/API/APE
> as honest refusals.
>
> **Madrid 95% machine-readable buildability in ~6–8 weeks with an existing Berlin pipeline.**

---

## §C — Batch 5: operationalization, data-model gaps & risk controls

### 9 — Target architecture

```
USER CLICK → MadridResolver.ts
   ├── NORMAS_ZONALES      → zoneCode, grado
   ├── PG_ORDENACION       → derived-plan detector
   └── NZ1 CONDITIONS      → explicit-area footprint
                ↓
        MadridRuleRegistry → Envelope Engine → Buildability Result
```

> **GIS answers:** "Where am I? Which zone applies? Is there a special plan? Is there already a footprint?"
> **Legal compiler answers:** "What does this zone allow?" — height, floors, FAR, coverage, setbacks, depth.

### 10 — Three data-model concepts Madrid reveals as missing

**10.1 — Add `grade`.** `{"zoneCode":"8"}` is insufficient; the legal rule attaches to the grade:

```json
{ "normaZonal":"8", "grado":"8.2.a" }
```

**10.2 — Add legal hierarchy / inheritance.** `Zona 8 → Grado 8.1 / 8.2 → Nivel a / b`:

```json
{ "ruleInheritance":{ "base":"Zona 8", "override":"8.2.a" } }
```

> **Otherwise extraction duplicates hundreds of rules.**

**10.3 — Add measurement semantics (critical).** Do not store `height:20`. Store:

```json
{ "value":20, "unit":"m",
  "measurement":"altura_de_cornisa",
  "referencePlane":"rasante_oficial",
  "sourceArticle":"8.4.xx" }
```

> Madrid, like Germany, has measurement definitions.

### 11–12 — Pipeline + Spanish NLP dictionary (`madrid_terms.yaml`)

```
PDF → Text extraction → Article segmentation → Zone classifier
    → Parameter extractor → Rule validator → Human approval → JSON registry
```

```yaml
farRatio:
  - edificabilidad
  - coeficiente de edificabilidad
  - intensidad edificatoria
coverage:
  - ocupación máxima
  - porcentaje de ocupación
height:
  - altura de cornisa
  - altura máxima
  - altura de coronación
floors:
  - número máximo de plantas
  - plantas sobre rasante
setback:
  - retranqueo
  - separación a linderos
depth:
  - fondo edificable
```

Pattern library (§22) adds: *altura total*, *retranqueo mínimo*, *edificabilidad máxima*.

### 13 — Per-field extraction strategy

**13.3 Floors — do NOT lose the original.** Store both:

```json
{ "display":"Baja + 5", "normalized":6 }
```
```json
{ "groundFloor":true, "upperFloors":5, "totalFloors":6 }
```

**13.5 Setbacks — ⭐⭐⭐⭐ hardest. "This is where the last 5% lives."**
Madrid has many exceptions, e.g. *"retranqueo mínimo salvo parcelas inferiores a…"*. Needs a rule
**tree**, not a scalar:

```json
{ "front":{ "default":5,
            "exceptions":[ { "condition":"parcel_width<10", "value":3 } ] } }
```

### 14 — Automated validation (Berlin approach)

Generate ~100 random test parcels per zone; compare GIS zone + rule JSON + manual sample.
Quality gate: **zone match >99% · parameter extraction confidence >95% · citation completeness =100%**

### 15 — What should NOT be automated

* **Protected buildings** (`PG_EDIFICIOS_PROTEGIDOS`) — different legal regime → `manual review`
* **APR / APE / API** — already solved → `derived-plan`, do not parse
* **NZ3** — keep refusal: *"specific volumetry required"*

### 16 — Sprint order (by value, not zone number)

`Sprint 1` MadridResolver v1 (zone · grade · derived plan · NZ1 geometry) → `Sprint 2` **NZ4** →
`Sprint 3` NZ8 → `Sprint 4` NZ5 + NZ7 → `Sprint 5` NZ1 explicit-area → `Sprint 6` validation & publication

### 17 — Realistic score

| Version | Contents | Score |
| ------- | -------- | ----: |
| v1 | GIS + NZ4 | ≈70% |
| v2 | + NZ8 + NZ5 + NZ7 | ≈90% |
| v3 | + NZ1 + exceptions | ≈95% |

Final 5%: APR/APE/API · NZ3 · protected buildings · exceptions · **pending modifications (temporal issues)**

### 18–20 — Backlog

**EPIC 1 — Madrid GIS Provider (P0)**

```typescript
resolveNormaZonal(latitude, longitude)
// { "zoneCode":"1", "grade":"1.2", "officialDesignation":"ZONA 1 GRADO 2º",
//   "source":{ "type":"official-gis", "layer":"NORMAS_ZONALES/0" } }
// fields: AMB_TX_ETIQ, AMB_TX_DENOM ; sample input {"lat":40.4236,"lon":-3.7079}

resolvePlanningRegime(point)
// { "regime":"derived-plan", "type":"APR", "id":"APR.17.03", "name":"Estaciones de Villaverde" }
// or { "regime":"direct-zoning" }        ← "This prevents false envelopes."

getExplicitFootprint(point)
// { "type":"Polygon", "rings":[[[-3.70,40.42], …]],
//   "source":{ "layer":"PG_CONDICIONES_EDIFICACION/6" } }
```

**EPIC 2 — Legal document ingestion.** Input is the official *Compendio de las Normas Urbanísticas
PGOUM-97* **only** — not blogs, summaries, or planning websites.

**§20 — the `madrid_articles` database becomes the citation backbone:**

```json
{ "document":"PGOUM-97 Compendio", "title":"Normas Urbanísticas",
  "article":"8.4.10", "text":"…", "zone":"4", "effectiveDate":"2025-07" }
```

### 24 — Confidence scoring (stricter than Berlin, because legal exceptions are common)

| Band | Range | Requirements |
| ---- | ----- | ------------ |
| 🟢 **Green** | 95–100% | official text · article · paragraph · value parsed · no ambiguity |
| 🟡 **Yellow** | 70–95% | official text · article exists · paragraph unclear |
| 🔴 **Red** | <70% | secondary source · inferred — **never enters production** |

### 25 — Final package layout

```
/jurisdictions/spain/madrid/
    zones.json   sources.json   gis-provider.ts
    rules/  nz1.json  nz4.json  nz5.json  nz7.json  nz8.json
```

### 26 — Biggest unknowns

| # | Unknown | Risk | Note |
| - | ------- | ---- | ---- |
| 1 | Legal extraction difficulty | **Medium** | *"Unlike Belgium/Germany, Madrid's text is less structured."* Solution: reuse article segmentation |
| 2 | Grade inheritance | **Medium** | must map `Zona → grado → nivel` correctly |
| 3 | **Exceptions** | **High** | corner parcels, protected buildings, special catalogues, existing buildings → **do not solve; return exception** |

### 27 — Revised timeline

`Week 1` GIS adapter · `Weeks 2–3` NZ4 (60–70% residential coverage) · `Weeks 4–5` NZ8/NZ5/NZ7
(85–90%) · `Weeks 6–8` NZ1 explicit-area + COEF_Z + validation (90–95%)

### Final assessment

> The earlier blocker *"Madrid is missing GIS"* **was wrong.** The reality:
> `GIS maturity 95% · Legal structuring 40% · Engine adaptation 80%` → **≈45–50% production-ready
> today, ≈90–95% after implementation.**
>
> **Do not spend more time discovering GIS. Start building the Madrid adapter and legal compiler.**
> Next concrete deliverable: **`MadridProvider.ts` + `MadridRuleSchema` + NZ4 extraction specification.**

---

## §D — Capture notes (MINE, not the founder's)

### C-12 — CONFLICT: the NZ1 priority has now flipped three times

This is the most consequential unresolved item across all five batches, because it decides what the
next code task is.

| Source | NZ1 position | Stated reason |
| ------ | ------------ | ------------- |
| Batch 2 §39 | **3rd** — `NZ4 → NZ8 → NZ1 → NZ7 → NZ5 → NZ3` | — |
| Batch 2 §50 | **2nd** — `NZ4 → NZ1 → NZ8 → …` | *"NZ1 is no longer research blocked. It is **engineering** blocked."* |
| Batch 3 §Phase 2 | **3rd** | — |
| **Batch 4 §4** | **4th** — *"Do NOT start with NZ1"* | *"actually technically hardest despite GIS availability"* |
| **Batch 5 §16/§21** | **5th (Sprint 5)** | *"The data exists. The bottleneck is not extraction. It is: explicit-area solver."* |

**Both readings agree on the facts and disagree on the conclusion.** Everyone concurs NZ1 is
engineering-blocked, not research-blocked. §50 treats that as a reason to do it *early* (cheap, no
ordinance read, unblocks the historic core). Batches 4–5 treat it as a reason to do it *late*
(engine change is riskier than parameter extraction; NZ4 delivers more coverage per week).

I flagged §50's ordering to the Madrid documentation agent as authoritative before batches 4–5
arrived. **That instruction is now stale** and I will correct it. The later, more detailed batches
favour NZ1-late, and the coverage argument is concrete (NZ4 = 30–40% of Madrid residential in 2–3
weeks; NZ1 = the historic core only). But this is the founder's call, not mine to settle silently —
it is recorded here as **open**.

### C-13 — `referencePlane: "rasante_oficial"` corroborates L-584 from an independent direction

Batch 5 §10.3 requires height to carry a `referencePlane`, naming *rasante oficial*. This is the same
defect class as **L-584** ("terrain/rasant is a LEGAL defect"): PRYZM has terrain but samples **one
point at the block centroid**, while the ordinance measures from the *rasante* at the **façade**.

Madrid arriving at the same requirement independently is corroboration that the reference plane must
be a first-class field, not an implementation detail. Note the founder's list is still incomplete for
our purposes: it names the plane but not the *sampling rule* along it, which is exactly where L-584
went wrong.

### C-14 — The Berlin-reuse claim is now explicit and testable — and it is the highest-value item here

Batch 4 §0 puts a number on it: **~80% reusable, ~20% Madrid-specific**, with `Rule normalization →
existing schema → reusable ✅` and only `Chapter segmentation → Spanish parser needed 🟢 easy`.

This is directly actionable against `packages/ordinance-extraction/`, where the born-digital
text-parse path and German grammar landed this session (`8d37d894`) behind a `localeGate`. If the
adapter contract holds, Madrid is **a Spanish grammar + a `Título VIII` chapter classifier**, not a
second pipeline.

**The honest caveat I raised in C-11 still stands and is now sharper:** Berlin's input is a *bplan*
(a per-plan document); Madrid's is a *consolidated city-wide ordinance* with an article hierarchy
(`Título → Capítulo → Artículo → apartado`) and **rule inheritance across grados** (§10.2) that
Berlin has no analogue for. The founder's own §26 concedes *"unlike Belgium/Germany, Madrid's text is
less structured."* So "80% reusable" is a **hypothesis worth testing early and cheaply** — not a
finding. The cheapest test: run the existing extractor against the Compendio PDF and measure what
fraction of `Título VIII` it segments correctly before writing any Spanish grammar.

### C-15 — Grade inheritance (§10.2) is a genuine schema gap, not just a Madrid detail

`ruleInheritance: { base, override }` has no equivalent in the Barcelona pack, where each *clau* is a
flat, self-contained rule. Madrid's `Zona → grado → nivel` is a three-level tree where parameters
inherit and are selectively overridden. This is the same *shape* of problem as Denmark needing a
per-parcel placement resolver that Barcelona did not (landed this session) — i.e. **the third
consecutive city to require a structural addition the Barcelona template lacks.**

That pattern is worth naming in the Envelope Replication Standard: the five slots hold, but S4's
*internal* structure is turning out to be jurisdiction-shaped far more often than the original ADR
assumed.

### C-16 — Version evidence now leans July 2025

Batch 5 §20's article-database exemplar carries `"effectiveDate": "2025-07"`, and batch 4 names the
source file `PGOUM_COMPENDIO_2025.pdf`. Combined with the batch-3 PDF URL
(`COMPENDIO_MPG_NNUU_07_07_2025.pdf`, "COMPENDIO JULIO 2025"), three of five batches now point at
**July 2025**, against one Madrid.es page URL saying *actualizado a 24-09-2025* and batch 2's "2023".

**Still not resolved by weight of mentions** — a September consolidation would *supersede* a July one,
so the outlier may be the correct answer. C-6 stands: fetch both and compare.
