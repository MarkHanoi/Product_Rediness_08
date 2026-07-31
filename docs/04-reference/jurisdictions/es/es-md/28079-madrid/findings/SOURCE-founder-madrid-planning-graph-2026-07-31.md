# SOURCE — Founder Madrid Planning Graph & Legal Compiler Specification (raw capture)

> **Provenance.** Founder-provided research, delivered 2026-07-31 (batch 6, two messages).
> Captured **verbatim** in §A–§B. §C is mine and is marked as such.
>
> **This batch adds four GIS layers and one dangerous-silent-error finding that no earlier batch
> contained.** It is the most net-new material since batch 1.
>
> Companion captures: [`…-recon`](./SOURCE-founder-madrid-recon-2026-07-31.md) ·
> [`…-roadmap`](./SOURCE-founder-madrid-roadmap-2026-07-31.md) ·
> [`…-feasibility`](./SOURCE-founder-madrid-feasibility-2026-07-31.md) ·
> [`…-execution-plan`](./SOURCE-founder-madrid-execution-plan-2026-07-31.md)

**Founder's headline, quoted:**

> **Madrid should not be treated only as "zones + parameters".** Madrid has enough official GIS
> structure to create a richer planning graph. That is closer to how a real municipal permitting
> engine works.

```
Parcel
 ├── Norma Zonal      ├── Protección              ├── Alignment
 ├── Grado/Nivel      ├── Uso                     ├── Explicit footprint
 ├── Ámbito           ├── Edificación existente   ├── Legal parameters
                                                  └── Exceptions
```

---

## §A — Batch 6a: Madrid-specific layers to add

### Maturity summary (current → target)

| Component | Current | Target |
| --------- | ------: | -----: |
| Parcel → Norma Zonal | 100% | 100% |
| Norma Zonal grade | 100% | 100% |
| Derived planning detection | 100% | 100% |
| NZ1 footprint | 100% | 100% |
| Alignment geometry | 80% | 100% |
| Legal parameters | 30–40% | 90–95% |
| FAR | 20–30% | 90% |
| Height / Floors / Coverage / Setbacks | 0% | 90% |
| **Protection constraints** | 50% | 90% |
| **Existing building constraints** | 50% | 90% |
| **Full envelope engine** | **40%** | **95%** |

### 1. Protected buildings / heritage ⭐⭐⭐⭐⭐ — *"probably the biggest missing piece"*

Layer `PG_EDIFICIOS_PROTEGIDOS` should become a **first-class constraint**:
`parcel → Norma Zonal` must become `parcel → Norma Zonal → Protected building?`

```json
{ "heritageConstraint":true, "catalogueLevel":"I",
  "source":"PG_EDIFICIOS_PROTEGIDOS",
  "effect":"requires specific intervention rules" }
```

> **Why important:** a technically correct NZ4 envelope can still be **legally impossible** because
> the building is catalogued.

### 2. Existing building footprint comparison ⭐⭐⭐⭐ — **NEW LAYER**

Madrid exposes **`PG_ANALISIS_EDIFICACION`**:

```json
{ "existingBuilding":{ "footprint_m2":420, "floors":6, "existingVolume":8400 } }
```

> Then the engine can answer: new build? extension? rehabilitation? replacement?
> **This is much closer to real permit logic.**

### 3. Use regulation graph ⭐⭐⭐⭐

`PG_USOS_Y_ACTIVIDADES` — do not reduce to `residential=yes/no`:

```json
{ "uses":[ { "type":"residential", "class":"qualified" },
           { "type":"office",      "class":"compatible" } ] }
```

> Buildability is not only geometry. A parcel can have a good envelope **+** a forbidden use
> **= no project.**

### 4. Official alignment network ⭐⭐⭐⭐⭐ — critical for NZ4

Upgrade `alignment=true` to real geometry:

```json
{ "streetAlignment":{ "geometry":"polyline", "source":"PG_GESTION/Alineaciones" } }
```

> `parcel → alignment line → buildable depth → envelope`. **This makes NZ4 deterministic.**

### 5. Separate "zoning grade" from "building condition grade" — **"extremely important" discovery**

> **Do not model `grade` as one field.** Madrid has multiple grades on different dimensions:

```
Norma Zonal grade      →  1.3
Building condition grade →  COND_EDIF = 3
```

```json
{ "zoning":{ "zone":"1", "grade":"3" },
  "buildingCondition":{ "grade":3 } }
```

> **This prevents a very dangerous silent error.**

### 6. Legal uncertainty objects — *"Madrid needs this more than Germany"*

```json
{ "constraint":{ "field":"COEF_Z", "value":"0 / 5", "status":"coded-value",
                 "usable":false, "reason":"semantic mapping missing" } }
```

> Never `{ "far":5 }` until verified.

### 7. Madrid legal dictionary — *"probably the highest leverage asset"*

`MadridLegalDictionary.json` — *"This lets the Berlin parser become multi-country."*

### 8. Automatic article citation extraction

> Madrid is actually **easier than some countries** because: official PDF exists · stable numbering ·
> consolidated version exists.

### 9. Version management

```json
{ "jurisdiction":"Madrid", "legalVersion":{ "name":"Compendio NNUU", "date":"2025-07" } }
```

Every rule carries `validFrom` / `validTo`.

### 10. Confidence scoring **per field, not per zone**

> Bad: `NZ4 confidence = 80%`. Better:

```json
{ "zoneCode":{"confidence":100}, "farRatio":{"confidence":0},
  "height":{"confidence":0}, "footprint":{"confidence":100} }
```

### The Madrid "95% plan"

| Stage | Contents | Gain |
| ----- | -------- | ---: |
| 1 — GIS complete (`MadridGISProvider`) | almost achieved | ★★★★★ |
| 2 — Legal compiler | NZ4 → NZ8 → NZ5 → NZ7 → NZ1 semantics | **+40%** |
| 3 — Constraint graph | heritage, existing buildings, uses, special plans | **+10%** |
| 4 — Exception engine | APR, APE, API, protected buildings, special fichas | **+5%** |

### Final target — the system should answer *"Can I build here?"*, not *"What is the zoning?"*

```json
{ "parcel":"XYZ", "status":"buildable-with-conditions",
  "zone":{ "norma":"4", "grade":null },
  "envelope":{ "type":"alignment", "depth":22, "height":28, "floors":8 },
  "constraints":[ "protected facade", "APR area" ],
  "sources":[ { "GIS":"NORMAS_ZONALES", "legal":"PGOUM Art 8.4.12" } ] }
```

> Madrid is a **top-tier candidate.** The realistic ceiling is not 90% — it is closer to **95%
> machine-assisted buildability coverage for ordinary residential parcels.**

---

## §B — Batch 6b: the Madrid Legal Compiler specification

### Input sources (official only)

1. **Normas Urbanísticas PGOUM-97** (17 abril 1997), consolidated as **Compendio de las Normas
   Urbanísticas PGOUM-97** — used for FAR/edificabilidad, height, floors, occupation, setbacks,
   buildable depth, permitted uses, exceptions.
2. **Official GIS** — used as the *classifier* only.

> **Important: the GIS does not replace the ordinance.** It only answers *"Which legal chapter applies?"*

### Stage 1 — PDF ingestion → searchable legal corpus

```
Compendio_NNUU_Madrid.pdf  →  articles/article_8_1_01.json, article_8_4_01.json, article_8_8_01.json …
```

```json
{ "document":"PGOUM-97 Compendio", "article":"8.4.10",
  "title":"Condiciones de edificación en Norma Zonal 4", "text":"..." }
```

### Stage 2 — Article classifier → `zone_article_map.json`

```json
{ "NZ1":{ "chapter":"8.1", "articles":["8.1.1","8.1.2","8.1.3"] },
  "NZ4":{ "chapter":"8.4" } }
```

Título VIII covers Norma Zonal 1, 2, 3, 4, 5, 7, 8.

### Stage 3 — Legal term extraction

| Legal term | Engine field |
| ---------- | ------------ |
| fondo edificable | `buildableDepth_m` |
| alineación oficial | `alignment` |
| retranqueo | `setback` |
| separación a linderos | `setback` |
| ocupación | `maxCoverage` |
| altura de cornisa | `maxHeight_m` |
| número de plantas | `maxFloors` |
| edificabilidad | `farRatio` |

Worked example — *"El fondo máximo edificable será de 20 metros"* →
`{ "field":"buildableDepth_m", "value":20, "unit":"m" }`

### Stage 4 — Rule extraction schema (NZ4 exemplar)

```json
{ "zoneCode":"4", "officialDesignation":"Edificación en manzana cerrada", "ruleType":"alignment",
  "farRatio":{ "value":null, "status":"unknown" },
  "buildableDepth_m":{ "value":20, "unit":"m",
    "citation":{ "document":"PGOUM-97 Compendio", "article":"8.4.xx", "paragraph":"xx" } },
  "maxHeight_m":{ "value":null }, "maxFloors":{ "value":null }, "maxCoverage":{ "value":null },
  "setbacks":{ "front":null, "rear":null, "side":null } }
```

> **No guessing. Unknown stays `null`.**

### Stage 5 — Citation generator

```json
{ "value":70, "unit":"%", "scope":"parcel",
  "source":{ "title":"Normas Urbanísticas PGOUM-97", "article":"8.4.XX",
             "paragraph":"3", "page":"xxx" } }
```

### Stage 6 — Validation engine — *"where Madrid differs from a normal PDF parser"*

| Rule | Reject | Accept |
| ---- | ------ | ------ |
| **1 — no source** | — | `value=null, confidence=0` |
| **2 — no denominator** | `{ "farRatio":2 }` | `{ "value":2, "unit":"m2/m2", "densityScope":"parcel" }` |
| **3 — no measurement definition** | `height=25` | `height=25m, measurement=cornisa` |

### Priority extraction order & expected gain

| Phase | Zone | Articles | Need | Gain |
| ----- | ---- | -------- | ---- | ---: |
| **A** | **NZ4** | `8.4.x` | fondo edificable, height, floors, occupation, uses | **+40%** Madrid residential |
| B | NZ8 | `8.8.x` | front/side/rear setback, height, floors | +15% |
| C | NZ5 | `8.5.x` | block separation, occupation, height | +10% |
| D | NZ7 | `8.7.x` | — | +5% |
| E | NZ1 | `8.1.x` | **not geometry** (already GIS) — only COEF_Z meaning, height interpretation, protected conditions | +10% |

### ML vs deterministic — *"I would NOT start with an LLM-only approach"*

```
PDF parser → rule dictionary → LLM extraction → validator → human approval
```

> **The LLM proposes. The validator decides.**

### Module layout

```
/jurisdictions/es/madrid/
  gis/    NormaZonalProvider.ts   AmbitoProvider.ts   NZ1Provider.ts
  legal/  pgo_um_parser.ts  article_classifier.ts  rule_extractor.ts  citations.ts
  rules/  NZ1.json  NZ4.json  NZ5.json  NZ7.json  NZ8.json
```

### Estimated effort (because the Berlin pipeline exists)

| Task | Time |
| ---- | ---: |
| PDF ingestion adaptation | 2–3 days |
| Spanish legal vocabulary | 2 days |
| Article classifier | 3 days |
| NZ4 extraction | 1 week |
| NZ8 extraction | 1 week |
| Validation/citation system | 1 week |
| Human review | ongoing |
| **Total** | **5–8 weeks for a serious Madrid first release** |

> Madrid moves from *GIS-rich but legally incomplete (~40%)* to *citation-backed machine rules
> (~85–90%)*; adding heritage + existing-building analysis + special plans pushes toward
> **95% practical buildability coverage.**
>
> Next concrete artifact: **`madrid_legal_extractor_v1` specification + NZ4 extraction template.**

---

## §C — Capture notes (MINE, not the founder's)

### C-17 — NET NEW: four GIS layers no earlier batch named

| Layer | Purpose | First appears |
| ----- | ------- | ------------- |
| **`PG_ANALISIS_EDIFICACION`** | existing building footprint / floors / volume | **batch 6 only** |
| `PG_EDIFICIOS_PROTEGIDOS` | heritage catalogue | batch 2 (§36.1), promoted to first-class here |
| `PG_USOS_Y_ACTIVIDADES` | use graph (qualified/compatible) | batch 2 (§A9), given a class model here |
| `PG_GESTION/Alineaciones` | alignment polylines | batch 3 (§9), given geometry here |

`PG_ANALISIS_EDIFICACION` is the significant one: it changes the product question from *"what may be
built on an empty parcel"* to *"what may be done to this parcel given what already stands on it"* —
new build vs extension vs rehabilitation vs replacement. **None of these four layers has been probed.**
Their existence is asserted, not verified; treat every field name above as a hypothesis until a
`MapServer` query returns it.

### C-18 — §5's "dangerous silent error" is a real one, and it is our bug-class

The claim: `COND_EDIF` (building-condition grade) and the Norma Zonal grade are **different
dimensions** that both surface as a bare number. `1.3` and `COND_EDIF=3` share the digit `3` and mean
unrelated things.

This is exactly the failure shape PRYZM has hit before — two semantically different values collapsing
into one field because they look alike. Conflating them would silently apply the wrong rule set with
**no error raised and no confidence penalty**, which is worse than a refusal. The founder is right to
call it out, and the schema fix (`zoning.grade` vs `buildingCondition.grade` as separate objects) is
cheap insurance. Worth encoding as a type-level distinction, not a naming convention.

### C-19 — Batch 6 re-orders NZ1 *again* — but the disagreement is now narrower than it looks

C-12 recorded NZ1's priority flipping three times. Batch 6 §Phase E puts NZ1 **last**, but with a
crucial clarification the earlier batches lacked: *"Not geometry (already GIS). Only: COEF_Z meaning,
height interpretation, protected conditions."*

That **dissolves much of the conflict.** NZ1 splits into two independent pieces:

| Piece | Blocked on | Natural slot |
| ----- | ---------- | ------------ |
| `solveExplicitArea()` + `ExplicitAreaRule` in the rule union | **engineering only** — no ordinance read | can go **early**, in parallel with NZ4 extraction (§50's argument) |
| COEF_Z semantics, height interpretation, protected conditions | **legal extraction** | naturally **late** (batches 4–6's argument) |

So §50 and batches 4–6 were arguing about different halves of the same zone. Recommended reading:
**do the engine branch early (it is cheap, unblocks nothing else, and is a code task an agent can take
now); do the NZ1 legal semantics late.** C-12 remains formally open as the founder's call, but this
is a materially better resolution than picking a side.

### C-20 — "The LLM proposes, the validator decides" should be a standing rule, not Madrid-only

Batch 6's explicit rejection of an LLM-only path, plus the three hard validation rules (no source →
null; no denominator → reject; no measurement definition → reject), is the strongest statement of
extraction discipline in the whole corpus. It generalises directly to
`packages/ordinance-extraction/` and to every jurisdiction behind it.

Note it is **structurally the same guarantee** as the Denmark placement resolver shipped this session:
a source hierarchy with a proven-bindingness gate, inputs typed so failure ≠ absence, and refusal as a
typed value with a diagnostic trail. Two independent jurisdictions converging on the same four
invariants is a good sign the invariants are right — and an argument for lifting them out of both
rule packs into the shared contract rather than reimplementing them per country.

### C-21 — Effort estimates are now stable across batches; scope is not

Batches 4, 5, and 6 independently land on **~5–8 weeks** for a Madrid first release, assuming the
Berlin pipeline exists. That consistency is worth noting.

But the *scope* those weeks buy has grown: batch 4 costed GIS + NZ4/NZ8/NZ5/NZ7 + explicit-area;
batch 6 adds heritage, existing-building analysis, the use graph, alignment geometry, per-field
confidence, and version management — then claims the same 5–8 weeks and a higher ceiling (95% vs
90–95%). **Those are not consistent.** The added constraint-graph work is Stage 3 (+10%) and Stage 4
(+5%) in batch 6's own plan, i.e. explicitly *beyond* the legal compiler. Read the 5–8 weeks as
covering **Stages 1–2 only**; Stages 3–4 are unestimated.
