# SOURCE — Founder Madrid 100% Roadmap, Extraction Protocol & Implementation Spec (raw capture)

> **Provenance.** Founder-provided research, delivered 2026-07-31 across four consecutive messages.
> Captured **verbatim** in §A–§E below (the founder's own section numbering 1–52 is preserved).
> Nothing in §A–§E is my derivation or correction.
>
> **§F is mine** and is marked as such: it records a deliberate revision the founder made mid-delivery,
> plus items that bind to existing PRYZM contracts/ADRs.
>
> Companion capture: [`SOURCE-founder-madrid-recon-2026-07-31.md`](./SOURCE-founder-madrid-recon-2026-07-31.md)
> (the dataset state + completeness audit this roadmap builds on).

**Founder's framing, quoted:**

> The goal is not "find numbers"; the goal is:
> **Every output value → primary source → article/paragraph → structured field → engine-compatible rule.**

> How do we convert the PGOUM-97 legal text into a machine-readable zoning engine **without inventing values?**

---

## §A — Workstreams 1–8

### WS1 — Recover the official ordinance structure

Build the legal hierarchy:

```
PGOUM-97
├── Normas Urbanísticas
├── Título / Capítulo 8
│     ├── Norma Zonal 1
│     ├── Norma Zonal 3
│     ├── Norma Zonal 4
│     ├── Norma Zonal 5
│     ├── Norma Zonal 7
│     └── Norma Zonal 8
└── Annexes / fichas / modifications
```

> Current problem: the GIS tells us `parcel → NZ code` but **not** `NZ code → legal parameters`.

### WS2 — NZ1 completion

Available today:

```
NORMAS_ZONALES            →  AMB_TX_ETIQ = 1.x
PG_CONDICIONES_EDIFICACION →  geometry.rings, COEF_Z, CODMANZANA, NUMORD
```

**Gap — `COEF_Z` meaning.** Observed values include `COEF_Z = "5"` and `COEF_Z = "0 / 5"`. Must answer whether `5` means:

* **A)** `5 m2/m2` FAR · **B)** `5` floors · **C)** catalogue condition · **D)** something else

Extraction target: PGOUM-97 NNUU Chapter `8.1 Norma Zonal 1`. Search terms:
`coeficiente`, `edificabilidad`, `COEF_Z`, `aprovechamiento`, `m²/m²`.

Required output:

```json
{
 "zoneCode":"1.3",
 "parameter":"farRatio",
 "value":5,
 "unit":"m2/m2",
 "densityScope":"parcel",
 "source":{ "document":"PGOUM-97 Normas Urbanísticas", "article":"8.1.x", "paragraph":"x" }
}
```

### WS3 — NZ4 (highest ROI)

> NZ4 is likely the largest residential coverage. Rule kind = `alignment`.

Engine needs `AlignmentRuleSchema` populated with: `alignTo`, `alignmentOffset`, `partyWall`,
`buildableDepth`, `height`, `floors`, `coverage`.

Extraction from `PGOUM-97 NNUU Capítulo 8.4`:

* **A. Fondo edificable** → `buildableDepth_m` + `article` + `paragraph`
* **B. Height** — Madrid uses *altura de cornisa*, *altura total*, *plantas*. **Do not combine.**
* **C. Floors** — variations: *baja + n*, *sobre rasante*, *ático permitido*. Must normalize:
  legal `B+5` → `{ "maxFloorsAboveGround":5, "groundFloorIncluded":true }`
* **D. Coverage** — search *ocupación*, *porcentaje de ocupación*. **Need denominator.**
  Correct: `70% de parcela`. Incorrect: `70%` — the engine cannot know scope.

### WS4 — NZ8 (rule kind = `setback`)

Extract *retranqueo frontal / lateral / posterior* →
`{ "ruleType":"setback", "front_m":null, "side_m":null, "rear_m":null }`

> **Important:** if the ordinance says *"se permite adosamiento"*, do **not** encode `side=0`.
> Instead: `side=null`, `condition="party_wall_allowed"`.

### WS5 — NZ5 / NZ7

**NZ5 (open blocks)** — need *separación entre edificios*, *retranqueo a parcela*, *ocupación*, *altura*.
Potential issue: the rule may not be parcel-edge based. Decide whether it fits `SetbackRuleSchema`
or requires `building-separation`. **This is an engine question.**

**NZ7 (low density)** — likely `parcel setback + occupation + height`. Extract per grado.

### WS6 — Derived-plan engine (~100% coverage, already good)

Current: `PG_ORDENACION/3`; detect `APR`, `APE`, `API`. Formalize:

```json
{ "if":{ "TIPOAMB":["APR","APE","API"] },
  "result":{ "rule":"derived-plan", "reason":"specific planning instrument required" } }
```

### WS7 — Parcel foundation

Planning parcel gives `CODMANZANA` + `NUMORD`, but that is **not user-facing**. Need a Catastro connector:

```
User click → Catastro parcel → centroid → Madrid GIS → { Norma Zonal, NZ1 footprint, Ámbito }
```

```json
{ "parcelSource":{ "provider":"Catastro", "identifier":"REFCAT", "license":"..." },
  "planningJoin":{ "method":"spatial-intersection", "key":"CODMANZANA+NUMORD" } }
```

### WS8 — Machine-readable legislation layer (biggest strategic improvement)

> Madrid currently: GIS ★★★★★ · Law ★★☆☆☆

Solution: a **Madrid Planning Knowledge Graph** —
`NZ4 → article 8.4.3 → buildableDepth → { value 20, unit metres }`, plus height, floors, coverage.

### Effort by impact

| Task | Impact | Difficulty |
| ---- | ------ | ---------- |
| NZ4 extraction | ★★★★★ | Medium |
| NZ1 COEF_Z decoding | ★★★★★ | Low |
| NZ8 extraction | ★★★★ | Low |
| NZ5/NZ7 extraction | ★★★★ | Medium |
| Citation mapping | ★★★★★ | High |
| GIS metadata | ★★ | Low |
| Catastro licensing | ★★ | Low |

### Phased coverage movement

| Phase | Contents | Envelope coverage |
| ----- | -------- | ----------------- |
| 1 | NZ4 legal → NZ8 legal → NZ1 explicit-area engine → NZ1 COEF_Z | 0% → **50–60%** |
| 2 | NZ5 → NZ7 → use-matrix decoding | → **80–85%** |
| 3 | NZ3 volumetrías → APR/API/APE ingestion → protected buildings → fichas | → **95%+** |

> **The remaining impossible-to-automate gap.** Approved modifications, individual fichas, special
> plans, heritage conditions, and licensing interpretations will always create parcel-specific
> overrides. Realistic engineering target: **95% automated envelope coverage + 5% explicit refusal
> with cited reason.** That is the correct buildability-engine definition of "complete" for Madrid.

---

## §B — Sections 9–15: normalized schema & zone requirements

### 9 — Final normalized schema

> The biggest risk now is extracting data but not fitting the engine model. Madrid should not store
> "documents"; it should store **legal parameters with provenance**.

Target table `madrid_zoning_rules` — **one row = one Norma Zonal + grado**:

```json
{
 "jurisdiction":"Madrid", "country":"Spain",
 "zoneCode":"4",
 "officialDesignation":"Edificación en manzana cerrada",
 "ruleKind":"alignment",
 "farRatio":{ "value":null, "unit":"m2/m2", "densityScope":"parcel" },
 "maxHeight":{ "value":null, "unit":"m", "measurement":"cornisa" },
 "maxFloors":{ "value":null, "scope":"above_ground" },
 "maxCoverage":{ "value":null, "unit":"%", "denominator":"parcel" },
 "setback":{ "front":null, "rear":null, "side":null, "reason":"not applicable" },
 "buildableDepth_m":null,
 "permittedUse":[],
 "source":{ "document":"PGOUM-97 Normas Urbanísticas", "chapter":"8.4", "article":null, "paragraph":null },
 "effectiveDate":null,
 "confidence":"unverified"
}
```

### 10 — Zone-by-zone

**NZ1** — GIS COMPLETE (`zone`←NORMAS_ZONALES, `grade`←AMB_TX_ETIQ, `footprint`←PG_CONDICIONES_EDIFICACION,
`geometry` polygon, `CODMANZANA`, `NUMORD`). Missing = FAR interpretation.

> **Important:** the denominator may NOT be parcel. Because `COEF_Z` is attached to `CODMANZANA`,
> possible scope is **manzana** / parcela / catalogued area. **Must be verified.**

**NZ3** — not a parametric envelope; correct engine state `derived-plan`. Could improve if Madrid
publishes volumetric solids / height surfaces / 3D GIS → then `explicit-area`. Search
`PGOUM Capítulo 8.3`, *fichas de condiciones*, *volumen específico*.

**NZ4** — `Capítulo 8.4`. Fondo edificable (*"El fondo máximo edificable será de XX metros"*) →
`{ "value":20, "unit":"m", "scope":"parcel", "measurement":"from official alignment line" }`.
Height: keep *cornisa* and *total* separate. Floors: `Baja + 5` →
`{ "groundFloor":true, "upperFloors":5, "totalStoreys":6 }`. Occupation needs denominator.

**NZ5** — critical question: does Madrid regulate by **(A)** parcel setbacks front/rear/side, or
**(B)** building separation? This determines engine compatibility. If B, need:

```typescript
OpenBlockRuleSchema { buildingSeparation_m, towerSpacing_m, occupation }
```

> This may require an ADR. **It is not a data problem. It is a model capability problem.**

**NZ7** — mostly compatible with `setback`; extract per grade `7.1.a`, `7.1.b`, `7.2.e`.

**NZ8** — likely easiest after NZ4; GIS already gives the grades, need only *retranqueos* →
`{ "zoneCode":"8.2.a", "ruleKind":"setback", "setback":{ "front_m":5, "side_m":3, "rear_m":3 } }`

### 11 — GIS completeness (separate geographic from legal)

Geographic layer **95–100%**: zone assignment, grade assignment, derived-plan detection,
NZ1 footprint, parcel spatial join, CRS — all DONE.

### 12 — Official source registry — create `sources/MADRID.md`

```
SOURCE-001  PGOUM-97 Normas Urbanísticas
            URL: … · Version: Compendio 2023 · Authority: Ayuntamiento de Madrid
            Effective: unknown until verified

SOURCE-002  NORMAS_ZONALES ArcGIS
            URL: … · Layer: 0 · Fields: AMB_TX_ETIQ, AMB_TX_DENOM · Update: unknown
```

### 13 — Machine-readable maturity

| Axis | Score | Reason |
| ---- | ----- | ------ |
| GIS | **9.5/10** | Everything except legal parameters is queryable |
| Legislation | **4/10** | Missing NZ4/NZ8/NZ5/NZ7 numbers + NZ1 COEF meaning |

Readiness: routing 100% · refusal 95% · envelope generation ~0% · after NZ4/NZ8 ~60% ·
after all residential 80–90% · after special plans 95%.

### 14 — Human legal extraction queue

| Priority | Task | Expected gain |
| -------- | ---- | ------------- |
| P0 | NZ4 Cap 8.4 extraction | largest |
| P0 | NZ8 Cap 8.8 extraction | large |
| P1 | NZ1 COEF_Z decoding | unlock historic core |
| P1 | NZ7 extraction | medium |
| P2 | NZ5 extraction | medium |
| P3 | NZ3 special volumetry | edge cases |

### 15 — What "100%" means

A correct buildability engine should **not** attempt `100% parcels → envelope`. The legal reality is
that a Madrid parcel carries general Norma Zonal + possible special plan + heritage + individual
ficha + protected building + licence condition. Therefore:

```
100% parcels receive:  A) computed envelope   OR   B) legally cited refusal
NOT:                   100% envelopes
```

---

## §C — Sections 16–27: extraction protocol & implementation design

### 16 — Legal extraction protocol (P4 → P6)

```
Official PDF / HTML ordinance → Chapter identification → Article + paragraph extraction
  → Parameter classification → Normalization → Schema validation → Engine pack
```

Every number must carry: `value` + `unit` + `scope` + `legal citation` + `effective date` + `confidence`.

### 17 — Legal source hierarchy (authority precedence)

| Level | Source | Use for | Confidence |
| ----- | ------ | ------- | ---------- |
| **1** | PGOUM-97 Normas Urbanísticas / Compendio 2023 | heights, floors, occupation, setbacks, buildable depth, uses | `PRIMARY` |
| **2** | Modificación puntual del PGOUM | article modified, new use allowed, height changed | `PRIMARY-AMENDED` |
| **3** | Official GIS | spatial zone, footprint, alignment, planning areas | `PUBLISHED-STRUCTURED` |
| **4** | Secondary — architecture guides, developer summaries, consulting PDFs | **never for numeric engine parameters** | `NOT ACCEPTABLE` |

### 18 — Rule-pack architecture (not one file)

```
rules/madrid/
├── zones/     NZ1.ts  NZ3.ts  NZ4.ts  NZ5.ts  NZ7.ts  NZ8.ts
├── sources/   pgo_um97.json  gis.json
└── resolver/  normaZonal.ts  explicitArea.ts  ambito.ts
```

### 19 — NZ1 implementation

```
{ longitude, latitude } → NORMAS_ZONALES/0 → AMB_TX_ETIQ → 1.x
                        → PG_CONDICIONES_EDIFICACION/6 → rings[]
```

```typescript
{ ruleKind:"explicit-area",
  footprint:{ geometry:"polygon", source:"PG_CONDICIONES_EDIFICACION" },
  zoning:{ zone:"1.3" },
  provenance:{ sourceType:"published-structured" } }
```

**Blocker is engineering, not research.** Engine needs `solveExplicitArea()`; missing
`ComputeBuildableEnvelopeInput { explicitAreaFootprint? }`. Required change:

```typescript
type BuildableRule = AlignmentRule | SetbackRule | ExplicitAreaRule | DerivedPlanRefusal
```

### 20 — NZ4 implementation (first true parametric rule)

```typescript
{ zoneCode:"4", ruleKind:"alignment",
  alignment:{ alignTo:"official-line", offset_m:0, sideTreatment:"party-wall" },
  buildableDepth_m:X, height:{ cornice_m:Y }, floors:{ max:N } }
```

Resolver: `parcel → NORMAS_ZONALES → 4 → PG_GESTION/Alineaciones → fondo edificable → envelope`

> **Do not confuse the alignment line with the parcel boundary.** The legal operation measures depth
> from the **street line** — it is not a parcel shrink:
>
> ```
> street line
>        |<---- depth
>        █████████
>        █████████
> ```

### 21 — NZ8 implementation

```typescript
{ zoneCode:"8.2.a", ruleKind:"setback",
  setback:{ front_m:X, rear_m:Y, side_m:Z },
  height:{ value:X }, coverage:{ value:X, denominator:"parcel" } }
```

Resolver: `parcel polygon − front setback − rear setback − side setback = buildable envelope`

### 22 — NZ5 schema risk

Verify during extraction: *"separación a linderos"* → `SetbackRule` works.
*"distancia entre edificios"* → need new `OpenBlockRule`.

### 23 — NZ3 stays a refusal (architectural decision)

```json
{ "zoneCode":"3", "result":"refusal",
  "reason":"specific volumetric determination required",
  "source":"PGOUM-97 Norma Zonal 3" }
```

> A user receives: *"This parcel is NZ3. The municipality defines its volume through a specific
> approved volumetric determination. The engine does not fabricate a building envelope."*
> **That is legally stronger than an incorrect estimate.**

### 24 — Parcel coverage resolver order

```
Parcel coordinate → Derived plan check (APR/APE/API → REFUSE)
                  → Norma Zonal → NZ1 explicit-area
                                → NZ3 refuse
                                → NZ4 alignment
                                → NZ5 setback / open-block
                                → NZ7 setback
                                → NZ8 setback
```

### 25 — Grade matrix (Object 1)

Madrid is not `NZ4`; it is `NZ4 → grade?`:

```json
{ "zone":"8", "grades":["8.1.a","8.1.c","8.2.a","8.2.b"] }
```

### 26 — Parameter applicability (Object 2) — **never fill**

```json
{ "zone":"8.3.a",
  "parameters":{
    "height":{ "value":12, "source":"8.8.3 paragraph 4" },
    "coverage":{ "value":null, "status":"not found" } } }
```

### 27 — Next concrete research deliverables

| # | Deliverable | Contents |
| - | ----------- | -------- |
| 1 | `Madrid_NZ4_SOURCE.md` | official designation, every grade, FAR, height, floors, coverage, fondo, uses, article refs |
| 2 | `Madrid_NZ8_SOURCE.md` | same structure |
| 3 | `Madrid_COEF_Z_INTERPRETATION.md` | answer `COEF_Z = ?` with citation |
| 4 | Engine changes | explicit-area solver, ring resolver, provenance fields |

---

## §D — Sections 28–39: extraction checklist & false-positive controls

### 28 — Legal extraction matrix

> The objective is not "read the PGOUM". The objective is to fill every schema field with a
> **citable legal atom**: `field → value → unit → scope → zone/grade applicability → article →
> paragraph → source version → effective date`.

### 29 — NZ4 extraction plan

Target: `PGOUM-97 / Normas Urbanísticas / Título 8 / Capítulo 8.4 / Norma Zonal 4 / Edificación en manzana cerrada`

| Field | Required |
| ----- | -------- |
| zoneCode | 4 |
| grades | all |
| officialDesignation | yes |
| farRatio | yes/no/unknown |
| height | yes |
| height measurement | cornisa / total |
| floors | yes |
| coverage | yes |
| front setback | null unless stated |
| rear setback | null unless stated |
| side setback | null unless stated |
| **buildableDepth** | **mandatory** |
| **uses** | **mandatory** |

Expected legal concepts: **(A) alignment condition** — building line = official street alignment →
`alignmentOffset_m = 0`. **(B) fondo edificable** — exact wording *"El fondo máximo edificable será
de X metros"* or *"La profundidad edificable será de X metros"*; **do not store "approximately 20m",
only `20m` with citation.** **(C) height** — `height = 6 floors` is wrong; correct is
`maximum floors = 6` **and** `height = 22m measured to cornice` — *they are different constraints*.
**(D) attic/ático** — Madrid separates *plantas sobre rasante*, *ático*, *bajo cubierta*; needs
`{ maxFloorsAboveGround, atticAllowed, atticSetback, roofHeight }`.

### 30 — NZ4 grade discovery (false-positive control)

GIS showed `NZ4 = "4"` — a single code, unlike NZ8's `8.2.a`. NZ4 may express conditions through
subzones / degrees / frontage conditions / catalogues instead.

> Question to verify: **does NZ4 actually have grades in the ordinance, or only special conditions?**
> **Do not create `4.1` / `4.2` unless official.**

### 31–32 — NZ8 extraction

Source `PGOUM-97 Capítulo 8.8`. GIS grades already known. The legal table key must be
`zoneCode + grade` → `{"zoneCode":"8.2.a"}`, **not** `{"zoneCode":"8"}`.

1. **Occupation** — *ocupación máxima* / *superficie ocupada* / *porcentaje de ocupación* →
   `{ "value":30, "unit":"%", "denominator":"parcel" }`
2. **Retranqueos** — all three; never a single `setback = 5`, because front/rear/side differ.
3. **Height** — *altura máxima*, *altura de cornisa*, *número de plantas* →
   `{ "height":{"value":7,"measurement":"cornisa"}, "floors":{"max":2} }`

### 33 — NZ7 extraction

Source `Capítulo 8.7`. Grades `7.1.a`, `7.1.b`, `7.2.e`. Likely `setback`, but verify — some
low-density zones use *parcela mínima* and *separación a linderos* rather than occupation.
May need `minimumParcelArea_m2`.

### 34 — NZ5 extraction — **the most dangerous extraction**

Open blocks often regulate building separation, free space, occupation, and volume — not just
setbacks. Test the wording: *"retranqueo a linderos"* → use setback; *"distancia entre edificios"*
→ create `OpenBlockRule`.

### 35 — NZ1 COEF_Z investigation

Search `PGOUM-97 / Norma Zonal 1 / Coeficiente Z / Tabla de grados`. Accepted output:

```json
{ "field":"COEF_Z", "value":5, "meaning":"edificabilidad máxima",
  "unit":"m2/m2", "densityScope":"manzana", "article":"8.1.x", "paragraph":"x" }
```

If not found, the correct output is:

```json
{ "value":null, "reason":"GIS publishes coded value; ordinance interpretation not verified" }
```

### 36 — Additional datasets to connect

* **36.1 Protected buildings** — `PG_EDIFICIOS_PROTEGIDOS` → heritage override:
  `parcel → protected building? → yes → refuse / special conditions`
* **36.2 Fichas específicas** — NZ1 already exposes *Ficha Específica*:
  `NZ1 → ficha exists? → yes → no generic envelope → refuse`
* **36.3 Planning areas** — `PG_ORDENACION/3` → `{ "ambitoType":"APR", "code":"APR.xx.xx" }`

### 37 — Final dataset shape

`MADRID → { Spatial layer, Zone resolver, Rule table, Source table, Refusal table, Overrides }`

Complete parcel response vs honest refusal:

```json
{ "zoning":{"norma":"4"}, "decision":"compute",
  "rule":{ "kind":"alignment", "depth":{ "value":20, "source":"PGOUM art..." } },
  "confidence":"verified" }
```

```json
{ "zoning":{"norma":"3"}, "decision":"refuse",
  "reason":"Specific volumetric approval required", "source":"PGOUM Norma Zonal 3" }
```

### 38 — What 100% requires

**GIS** ✅ endpoint · CRS · zone routing · grades · parcel join · NZ1 geometry · derived plans.
Remaining: protected-overrides integration, ficha integration.

**Legislation** missing: NZ1 COEF_Z interpretation · NZ3 volumetric source refs ·
NZ4/NZ5/NZ7/NZ8 all numerical parameters.

**Engine** missing: explicit-area solver · possible open-block rule · special-volumetry refusal cards.

### 39 — Execution order (first version)

`NZ4 → NZ8 → NZ1 → NZ7 → NZ5 → NZ3 + special plans`
*(superseded — see §50 in §E, and §F1 below)*

---

## §E — Sections 40–52: stricter schema, precedence & final checklist

### 40 — The final schema must be stricter

> The current requested schema **is not enough for Madrid**, because the PGOUM separates
> Norma Zonal · grado · nivel · ficha específica · ámbito · protected building · catalog conditions.

```typescript
MadridZoneRule {
  zoneCode: string
  grade?: string
  officialDesignation: string

  geometryRule: "alignment" | "setback" | "explicit-area" | "derived-plan"

  parameters: {
    farRatio?:  { value:number, unit:"m2/m2",
                  denominator: "parcel" | "property" | "planning-area" }
    coverage?:  { value:number, unit:"%", denominator:"parcel" }
    height?:    { value:number, measurement:"cornice" | "total" | "unknown" }
    floors?:    { aboveGround?:number, atticIncluded:boolean }
    setbacks?:  { front?:number|null, rear?:number|null, side?:number|null }
    buildableDepth?: number|null
  }

  sources: [ { document:string, article:string, paragraph:string, date:string } ]
  confidence: "verified" | "partial" | "unknown"
}
```

### 41 — Madrid requires a legal-applicability resolver

> A common mistake would be: `GIS says NZ4 → apply NZ4 rule`. **That is incomplete.**

```
parcel → Norma Zonal → Grado → Ámbito → Protection catalogue → Ficha específica → Applicable rule
```

```
START → Check special planning area (APR/APE/API → REFUSE)
      → Check protected catalogue (protected? → special conditions)
      → Get Norma Zonal → Get grade → Apply rule
```

### 42 — Precedence (a parcel can carry several at once)

> A parcel could simultaneously have `NZ1.3` + protected building + specific catalogue sheet.
> **The engine cannot simply select NZ1.**

```
1. Approved specific volumetry
2. Protection catalogue
3. Derived planning area
4. Norma Zonal general rule
```

### 43 — Protected buildings integration

`PG_EDIFICIOS_PROTEGIDOS` — likely useful fields `NORMATIVA`, `COEF_Z`, `CATALOGO`, `NIVEL`
— **but do not assume.** Required: layer metadata + field inventory + sample query.

Must answer: does protected status **(A)** replace the envelope, or **(B)** modify parameters?

```json
{ "override":true, "type":"protected-building", "action":"refuse" }
```
```json
{ "override":true, "type":"protected-building",
  "constraints":["height reduced","facade retained"] }
```

### 44 — Ficha Específica integration

NZ1 resolver needs one extra branch: `NZ1 parcel → ficha exists? → yes → REFUSE`.

> Reason: the municipality already decided the building condition individually. The engine should
> say: *"This parcel has individually defined conditions. The general Norma Zonal footprint is not
> applicable."*

### 45 — FAR extraction caution

> The requested field `farRatio` **is dangerous.** Madrid may express intensity as *edificabilidad*,
> *coeficiente de edificabilidad*, *m2 edificables*, or *coeficiente Z* — **these are not
> automatically equivalent.**

Engine rule — never `COEF_Z = FAR` without citation. Until the ordinance confirms:

```json
{ "COEF_Z": { "status":"coded-value", "meaning":"unknown", "blocked":true } }
```

### 46 — Coverage extraction

*Ocupación máxima* could mean parcel occupation **or** block (*manzana*) occupation. Must store
`{ "value":70, "unit":"%", "denominator":"parcel", "source":"Article X paragraph Y" }` —
**never** a bare `{ "value":70 }`.

### 47 — Height extraction (most error-prone)

```json
{ "height": { "value":22, "unit":"m", "measuredFrom":"streetLevel", "measuredTo":"cornice" } }
```

> **If only floors exist, do not convert.** Wrong: `6 floors ≈ 20m`.
> Correct: `height_m: null`, `floors: 6`.

### 48 — The unknown-field policy

> Bad: `{ "maxCoverage": 0 }` — that means **"no occupation allowed"**.
> Correct: `{ "maxCoverage": null, "status":"not extracted" }`

```typescript
FieldValue<T> { value: T|null, status: "verified"|"unknown"|"not-applicable", source? }
```

### 49 — Completeness scoring

**Spatial ≈95%** — zone assignment 100%, grades 100%, NZ1 footprint 100%, derived-plan detection
100%, parcel boundary *depends on Catastro*.

**Legal ≈35–40% weighted residential** — NZ1 geometry 90% · NZ3 20% · NZ4 20% · NZ5 10% · NZ7 10% · NZ8 20%

**Engine ≈70%** — alignment available · setback available · **explicit-area missing** ·
derived refusal available · **special overrides missing**

### 50 — Revised path to 90%+ (supersedes §39)

```
1. NZ4 legal extraction
2. NZ1 explicit-area engineering   ← moved up
3. NZ8 extraction
4. Protected building override
5. NZ7
6. NZ5
7. NZ3 refusal polish
```

> **Reason: NZ1 is no longer research blocked. It is engineering blocked.** A small engine change
> unlocks a complete historic-core solution.

### 51 — Production checklist

**Legislation** ☐ NZ4 article table ☐ NZ8 article table ☐ NZ7 article table ☐ NZ5 article table
☐ NZ1 COEF_Z interpretation ☐ NZ3 refusal citation ☐ effective dates recorded

**GIS** ☑ official REST root ☑ zone routing ☑ grade routing ☑ CRS ☑ public access ☑ parcel spatial join
☐ protected catalogue resolver ☐ ficha resolver

**Engine** ☐ explicit-area solver ☐ ringRef resolver ☐ override hierarchy ☐ legal provenance display

### 52 — Conclusion

> Madrid is an unusually strong candidate because zoning routing is already machine-readable, NZ1 is
> a true GIS-native envelope, derived-plan areas are detectable, and the remaining problem is mostly
> legal transcription.
>
> The bottleneck is no longer discovering data. The bottleneck is **turning Chapters 8.1–8.8 of the
> PGOUM-97 Normas Urbanísticas into validated parameter tables with article-level citations.**
>
> The next practical step is a zone-by-zone extraction pass starting with **NZ4**, producing the
> first real `madrid-rules.json` with only verified values.

---

## §F — Capture notes (MINE, not the founder's)

### F1 — §50 supersedes §39 — this is a revision, not a conflict

The execution order changed mid-delivery and the founder gave the reason explicitly:

| | Order |
| - | ----- |
| §39 (earlier) | NZ4 → NZ8 → NZ1 → NZ7 → NZ5 → NZ3 |
| **§50 (authoritative)** | **NZ4 → NZ1 → NZ8 → protected-override → NZ7 → NZ5 → NZ3** |

NZ1 moved from 3rd to 2nd because it is *engineering*-blocked, not *research*-blocked — it needs
`solveExplicitArea()` and `ExplicitAreaRule` in the union type, not a trip to the ordinance. That
matters for agent routing: **NZ1 is the only item on the critical path that a code agent can close
without any legal extraction.** Everything else in Phase 1 waits on the PGOUM read.

### F2 — This roadmap independently re-derives several ratified PRYZM positions

Worth recording, because convergence from an outside pass is corroboration:

| Founder's item | Existing PRYZM position |
| -------------- | ----------------------- |
| §48 unknown-field policy — `null` + status, never `0` | **L-616**: massing drew setback-unknown as zero and ignored the FAR ceiling (~5× over). *Unknown ≠ permissive default.* |
| §45 `COEF_Z` blocked until cited | Same class as L-616; also the "probe can be wrong three ways" rule — corroborate with an independent source |
| §23/§37 honest refusal with cited reason | **Envelope-reject silent-fallback** defect: a hard reject degraded silently to the strip-slicer; fixed by an explicit envelope diagnostic |
| §15 "100% parcels get envelope **or** cited refusal" | **Madrid NZ-1 ring-only decision** — deliberately not computed; per-ficha case law is not an engineering gap |
| §17 four-level source hierarchy | The C63 SRC axis + `sources/VERIFICATION.md` convention |
| §47 never convert floors→metres | **Terrain/rasant is a legal defect** (L-584) — height measurement method is legally load-bearing |
| §20 depth measured from street line, not parcel shrink | Barcelona **inset-collapse** saga (L-529/L-581): the depth root cause was geometric, and the wrong mental model produced two confidently-wrong theories |

### F3 — §20's warning is the Barcelona lesson restated

> "Do not confuse the alignment line with the parcel boundary… not a parcel shrink."

This is worth flagging hard to whoever implements NZ4. Barcelona's `edificabilitat` is a
**construction, not a lookup** (ADR-0271), and the inset-collapse investigation burned significant
time on exactly this class of error — a plausible geometric model that was never probed. §34's
NZ5 caution ("the most dangerous extraction") is the same shape: a schema-fit assumption that must
be tested against the ordinance's actual wording before any code is written.

### F4 — Ordinance version conflict carries over

The 2023-vs-2025 Compendio conflict recorded as **C-1** in the companion recon capture reappears
here: §17 and §12 both say "Compendio 2023", while the recon's own cited URL is the
**2025** consolidation (*actualizado a 24-09-2025*). Since §16 requires an `effective date` on every
extracted number, this must be resolved **before** extraction begins, or the entire NZ4/NZ8 table
gets stamped with the wrong version.
