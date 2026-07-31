# SOURCE — Founder Madrid Feasibility Assessment & Route to 95% (raw capture)

> **Provenance.** Founder-provided research, delivered 2026-07-31 (third batch, two messages).
> Captured **verbatim** in §A–§B. §C is mine and is marked as such.
>
> **This batch is not a restatement.** It supplies primary-source URLs the earlier batches lacked,
> adds a GIS field nobody had recorded, and **contradicts** two earlier positions. Those changes are
> isolated in §C so they cannot be lost in the volume.
>
> Companion captures:
> [`SOURCE-founder-madrid-recon-2026-07-31.md`](./SOURCE-founder-madrid-recon-2026-07-31.md) ·
> [`SOURCE-founder-madrid-roadmap-2026-07-31.md`](./SOURCE-founder-madrid-roadmap-2026-07-31.md)

**Founder's headline, quoted:**

> **Madrid is actually one of the strongest cases in Europe for GIS-native planning extraction.**
> The GIS side is unusually good. The missing 40–50% is not because data does not exist — it is
> because the legal parameters are still encoded in the **PGOUM text (PDF/legal document)** rather
> than exposed as attributes.

> The bottleneck is **not GIS**. The bottleneck is turning the PGOUM legal text into structured rules.

---

## §A — Batch 3a: how close can Madrid get to 100% machine-readable?

### Realistic target table

| Area | Current | Possible with machine extraction |
| ---- | ------: | -------------------------------: |
| Parcel → zoneCode | ✅ 100% | 100% |
| officialDesignation | ✅ 100% | 100% |
| footprint geometry | ✅ NZ1 100% | maybe 40–50% citywide |
| derived-plan detection | ✅ 100% | 100% |
| FAR | 🟡 partial | 80–90% after legal mapping |
| height | ❌ | 80–90% possible |
| floors | ❌ | 80–90% possible |
| coverage | ❌ | 80–90% possible |
| setbacks | ❌ | 80–90% possible |
| article citations | 🟡 | 100% possible |
| fully machine-readable envelope engine | ~30–40% | **~90% possible** |

### PART A — can Madrid GIS give the legislation fields?

> **Answer: No, except NZ1 footprint.**

The GIS gives `parcel → Norma Zonal → grado → geometry → some coded values`, but **not**
`height = 28m`, `floors = 7`, `coverage = 70%`, `depth = 20m`, `setback = 5m`. Those are in the NNUU text.

#### 1. zoneCode ✅ DONE — confidence ★★★★★

`DESARROLLO_URBANO_ACTUALIZADO / NORMAS_ZONALES / MapServer/0`, field **`AMB_TX_ETIQ`**.
Examples: `1.1`, `1.2`, `1.3`, `4`, `8.2.a`. Already machine usable, no extraction needed.

#### 2. officialDesignation ✅ DONE — confidence ★★★★★

GIS field **`AMB_TX_DENOM`**. Examples:

```
ZONA 1 GRADO 3º
NZ 4
ZONA 8 GRADO 2º NIVEL a
```

#### 3. footprint geometry

**NZ1 — ✅ COMPLETE.** `PGOUM97 / PG_CONDICIONES_EDIFICACION / Layer 6`, fields
`geometry.rings`, `CODMANZANA`, `NUMORD`, `COEF_Z`. The dataset description confirms it represents
the building-condition plan and the footprint/*fondo* data for Norma Zonal 1.

> This is the ideal case: `GIS polygon → explicit-area rule → engine`.
> Missing: explicit-area solver branch; legal interpretation of `COEF_Z`.

**NZ4 — 🟡 partial.** GIS has `Alineaciones` but **not** *fondo edificable*. So you can build
`alignmentRule { alignTo:"official-line", offset:0 }` but `buildableDepth_m` is missing.

**NZ8 — ❌.** GIS does not expose front/side/rear setbacks.

#### 4. FAR — 🟡 possible, requires semantic extraction

> **WARNING: The field exists. The meaning does not.** You cannot assume `COEF_Z=5 = 5 m2/m2 FAR`
> because the legal definition must come from the ordinance.

Extract from PGOUM Compendio `Título VIII / Capítulo 8.1 / Zona 1`, find *Coeficiente Z*, then:

```json
{ "field":"farRatio", "value":5, "unit":"m2/m2", "densityScope":"parcel",
  "source":{ "document":"PGOUM 1997", "article":"8.1.xx", "paragraph":"x" } }
```

Until that extraction: `farRatio = null`.

#### 5. Height — ❌ today, but easy to recover

> The PGOUM has structured wording. The extraction problem is not GIS. It is PDF → structured parser.

```
Altura máxima de cornisa:  X metros
Número máximo de plantas:  Baja + 5
```

Pipeline: `PDF → OCR/layout extraction → chapter classifier → table extraction → rule JSON` →
`{ "zone":"4", "maxHeight_m":22, "measurement":"cornisa", "article":"8.4.12" }`

#### 6. Floors — ❌, same solution. Machine-readable potential ★★★★★

#### 7. Coverage — ❌. Search *ocupación máxima*, usually *% de ocupación sobre parcela*

> Your schema is correct: must store denominator. Wrong: `coverage:70`.
> Correct: `{ "value":70, "unit":"%", "denominator":"parcel" }`

#### 8. Setbacks — ❌ but extractable

Search *retranqueo*, *separación a linderos*, *alineación*, *separación mínima*.
NZ8 likely *retranqueo delantero / lateral / posterior*.

> Never `0`. Use `null` if not applicable.

### PART B — parcel data ("actually excellent")

* **hasOpenSource** — YES ★★★★★
* **Planning zones endpoint** — `https://sigma.madrid.es/hosted/rest/services/DESARROLLO_URBANO_ACTUALIZADO/NORMAS_ZONALES/MapServer/0`
* **NZ1 envelope endpoint** — `PGOUM97/PG_CONDICIONES_EDIFICACION/MapServer/6`
* **Auth** — none · **CRS** — `EPSG:25830` native, can query `outSR=4326`

**parcelIdField — important:**

> **Madrid does NOT use Catastro refcat as join.** The planning key is `CODMANZANA` + `NUMORD`,
> but obtained **spatially**.
>
> Correct architecture: `clicked coordinate → NORMAS_ZONALES → CONDICIONES_EDIFICACION`
> **NOT:** `refcat → CODMANZANA`

### PART C — meta

* **ordinanceUrl** — *Normas Urbanísticas del Plan General de Ordenación Urbana de Madrid*, 17 April 1997, via Madrid official legal publication (SEDE Electrónica ELI)
* **Version** — `Compendio NNUU PGOUM-97`; official consolidated text exists
* **Machine readable** — GIS **YES**, legal text **NO** → `GIS: 95% · LAW: 40% · TOTAL: ~65%`

### Madrid extraction strategy

**Phase 1 — finish GIS (already 90%).** Build `MadridProvider.ts` with
`getNormaZonal(point)`, `getAmbito(point)`, `getNZ1Footprint(point)`, `getAlineacion(point)`.

**Phase 2 — legal extraction pipeline. Do NOT manually read PDFs.**

```
PGOUM PDF → chapter splitter → Zona classifier → parameter extractor → validation → JSON rules
```

Target zones: 1, 3, 4, 5, 7, 8.

**Phase 3 — rule tables**, e.g.

```json
{ "zoneCode":"4", "ruleType":"alignment",
  "buildableDepth_m":{ "value":20, "source":{ "article":"8.4.xx", "paragraph":"2" } },
  "maxFloors":{ "value":6 },
  "coverage":{ "value":70, "denominator":"parcel" } }
```

### Honest scoring today (strict rule: official primary sources, exact articles, no inference)

| Category | Score |
| -------- | ----: |
| GIS routing | 100% |
| zone classification | 100% |
| NZ1 geometry | 100% |
| parcel join | 100% |
| legal citations | 30% |
| FAR | 30% |
| height | 0% |
| floors | 0% |
| coverage | 0% |
| setbacks | 0% |
| **complete buildability engine** | **~35–40%** |

> After a serious PDF extraction project: **90–95% is realistic.** The last 5–10% will always be
> special fichas, protected buildings, APR/API/APE plans, exceptions.
>
> Madrid is therefore a very good candidate — **probably stronger than many German cities** because
> the GIS is already exposing the zoning topology and NZ1 footprint. The missing work is a
> **legal-to-JSON compiler, not a GIS discovery problem.**

### Primary sources cited (batch 3a)

| # | URL | What it is |
| - | --- | ---------- |
| 1 | `https://sigma.madrid.es/hosted/rest/services/DESARROLLO_URBANO_ACTUALIZADO/NORMAS_ZONALES/MapServer` | Official zoning MapServer |
| 2 | `https://sede.madrid.es/eli/es-md-01860896/iurb/1997/04/19/(1)/dof/spa/html` | **ELI — Normas Urbanísticas del PGOUM, 17 April 1997** (SEDE Electrónica, HTML) |
| 3 | `https://datos.madrid.es/dataset/300136-0-ordenacion-urbana-edificacion` | PGOUM 97 *Condiciones de la edificación* — open-data portal record |
| 4 | `https://sigma.madrid.es/hosted/rest/services/PGOUM97/PG_CONDICIONES_EDIFICACION/MapServer/find` | NZ1 condition layer (find endpoint) |
| 5 | `https://geoportal.madrid.es/fsdescargas/IDEAM_WBGEOPORTAL/ESTATICOS_VISORES_URBANISTICOS/PG97/TEXTOS/COMPENDIO_MPG_NNUU_07_07_2025.pdf` | **The actual Compendio PDF** — "COMPENDIO JULIO 2025" |

---

## §B — Batch 3b: refined route to 95%

> Yes — the plan is realistic, but I would refine the scoring and the route to **95%**. The key
> mistake would be assuming that "PDF extraction" alone gets you there. Madrid is actually a
> **hybrid GIS + legal rules compiler problem.**

Path to 95%:

1. **Exploit GIS completely first** (Madrid is unusually strong)
2. **Create a legal extraction layer from PGOUM**
3. **Link legal rules to GIS zone codes + grados**
4. **Build exception detection**
5. Accept that the last 5% is legally impossible without project-specific documents

### 1 — Where Madrid really stands today

| Field | Current confidence |
| ----- | -----------------: |
| zoneCode | 100% |
| officialDesignation | 100% |
| zone routing | 100% |
| parcel spatial join | 100% |
| NZ1 footprint geometry | 100% |
| derived-plan detection | 100% |
| legal source | 100% |
| article references | 0–20% |
| FAR | 20–40% |
| height | 0% |
| floors | 0% |
| coverage | 0% |
| setbacks | 0% |
| buildable depth | 0% |

> **Current machine buildability engine coverage: ~35–40%.**
> That is not bad. **Most European cities would be below 20%.**

### 2 — The 95% strategy

> **Do NOT try to create a "Madrid zoning database". Create a `Madrid Planning Compiler`.**

```
Official GIS + Official PGOUM text + Official amendments + Structured rule model
                              ↓
                    Buildability Engine
```

`zoneCode` (`AMB_TX_ETIQ`) and `officialDesignation` (`AMB_TX_DENOM`) are both **100% solved**.

### 3 — The missing legal layer

> The PGOUM is structured much better than many countries. **You do NOT need to parse the whole
> document.** You need only `Título VIII — Condiciones particulares de las zonas de suelo urbano`.

Relevant chapters:

```
8.1 Norma Zonal 1     8.5 Norma Zonal 5
8.2 Norma Zonal 2     8.6 Norma Zonal 6
8.3 Norma Zonal 3     8.7 Norma Zonal 7
8.4 Norma Zonal 4     8.8 Norma Zonal 8
```

Extraction target: `Zona → Grado → Artículo → Parameter`.

### 4 — FAR extraction (solve first)

> Because Madrid already exposes `COEF_Z`. **The missing piece is semantic.**

Search the official Compendio for *coeficiente de edificabilidad*, *coeficiente Z*, *edificabilidad*, *m2/m2*.

```json
{ "zoneCode":"1.3",
  "farRatio":{ "value":5, "unit":"m2/m2", "denominator":"parcel" },
  "source":{ "title":"Normas Urbanísticas PGOUM-97", "article":"8.1.xx", "paragraph":"3" } }
```

Expected: FAR today 40% → after extraction **90%**. Not 100% because some grades have special
conditions, some APR/API override, and protected buildings intervene.

### 5–8 — Remaining fields

| Field | Search terms | Today | After compiler |
| ----- | ------------ | ----: | -------------: |
| **Height** | *altura máxima*, *altura de cornisa*, *altura total*, *número de plantas* | 0% | **85–90%** |
| **Floors** | *Número de plantas*, *Baja + X* → needs rule "Baja counts as floor", validated against legal wording | 0% | **90%** |
| **Coverage** | *ocupación*, *ocupación máxima*, *porcentaje de ocupación* — needs denominator | 0% | **85–90%** |
| **Setbacks** | NZ4 is *not* setback — it is *alineación + fondo edificable* (`ruleType:"alignment"`); NZ8 needs *retranqueo delantero/lateral/posterior* | 0% | **80–90%** |

### 9 — The GIS opportunity nobody should ignore

> **The GIS can reduce legal complexity.**

| Purpose | Layer |
| ------- | ----- |
| Zone routing | `NORMAS_ZONALES` |
| Alineaciones | **`PG_GESTION`** |
| NZ1 footprint | `PG_CONDICIONES_EDIFICACION` |
| Derived plans | `PG_ORDENACION` |

Engine becomes: `click parcel → find zone → find grado → check plan override → apply rule → generate envelope`

### 10 — The legal compiler

```
Compendio NNUU PGOUM (official PDF)
  → chapter detection → zone classifier → table extraction
  → legal phrase extraction → HUMAN VALIDATION → JSON
```

Worked example — raw text:

```
La altura máxima será de 4 plantas y 14 metros de altura de cornisa.
```

Generated:

```json
{ "zoneCode":"8.2.a",
  "maxFloors":{ "value":4, "source":{ "article":"8.8.xx", "paragraph":"2" } },
  "maxHeight_m":{ "value":14, "measurement":"cornisa",
                  "source":{ "article":"8.8.xx", "paragraph":"2" } } }
```

### 11 — Realistic final score

| Category | Today | After 3–6 month serious extraction effort |
| -------- | ----: | ----------------------------------------: |
| GIS | 95–100% | — |
| zoning topology | 100% | — |
| zone routing | — | 100% |
| official designation | — | 100% |
| NZ1 / footprint geometry | 80–90% | 80–90% |
| FAR | — | 90% |
| height | — | 90% |
| floors | — | 90% |
| coverage | — | 85–90% |
| setbacks | — | 85% |
| article citations | — | 95–100% |
| legal extraction | 20% | — |
| **complete engine** | **35–40%** | **90–95%** |

### What prevents 100%

1. **Fichas específicas** — parcel-specific, not general zoning
2. **APR/API/APE** — *Área de Planeamiento Remitido / Específico*; need individual plans
3. **Protected buildings** — historic restrictions
4. **Interpretation ambiguity** — *altura máxima* could mean cornice, total height, or roof ridge; needs legal interpretation

### Recommended roadmap

**Phase 1 — GIS completion (already 90%):** ✅ zone resolver ✅ grado resolver ✅ derived-plan detector ✅ NZ1 explicit-area

**Phase 2 — legal extraction, priority order:**

| # | Zone | Reason | Need |
| - | ---- | ------ | ---- |
| 1 | **NZ4** | Highest ROI — dominant residential zone, simple alignment model | fondo edificable, height, floors, coverage, FAR |
| 2 | **NZ8** | Second | setbacks, height, floors, coverage |
| 3 | **NZ1** | Unlock `COEF_Z` semantics | — |
| 4 | **NZ5 / NZ7** | Then open blocks, low density | — |

### Final assessment

> The city is not blocked by missing data. It is blocked by **semantic translation**:
> `Spanish legal urbanism → structured rules → geometry engine`.
>
> A realistic target is **95% machine-readable buildability for normal residential parcels.**
> A true 100% is not realistic because Madrid itself does not define every parcel through general
> rules — some are intentionally delegated to project-specific instruments.

---

## §C — Capture notes (MINE, not the founder's)

This batch is materially different from batches 1–2. Four items **change** prior conclusions; two
are net-new primary sources. None of this should be flattened into "more of the same".

### C-6 — NET NEW: the actual Compendio PDF URL — and it makes the version conflict *worse*

Batch 3a supplies the direct PDF, which no earlier batch had:

```
https://geoportal.madrid.es/fsdescargas/IDEAM_WBGEOPORTAL/ESTATICOS_VISORES_URBANISTICOS/
PG97/TEXTOS/COMPENDIO_MPG_NNUU_07_07_2025.pdf     ← "COMPENDIO JULIO 2025"
```

There are now **three** candidate consolidation dates in the captured material, not two:

| Candidate | Evidence | Batch |
| --------- | -------- | ----- |
| **2023** | §17 and §12 of the roadmap both say "Compendio 2023"; WP2's citation exemplar stamps `"effective":"2023"` | 2 |
| **2025-09-24** | Madrid.es publication page URL: `Compendio-2025-…-actualizado-a-24-09-2025` | 1 |
| **2025-07-07** | The PDF filename itself: `COMPENDIO_MPG_NNUU_**07_07_2025**.pdf`, titled "COMPENDIO JULIO 2025" | **3** |

The July PDF and the September publication page are probably **different consolidations of the same
year** — meaning the file linked from the September page may not be the July PDF. This is now a
**blocking** item: §16 requires an `effective date` on every extracted number, and the extraction
starts with NZ4. Getting this wrong stamps the wrong version onto the entire first rule table.
**Resolve by fetching both and comparing, not by reasoning about filenames.**

### C-7 — NET NEW: `AMB_TX_DENOM` closes the officialDesignation gap

Batch 2 §A2 scored `officialDesignation` at **🟡 70%** and said *"exact legal names per grado"* were
missing, requiring a Compendio read. Batch 3 identifies the GIS field **`AMB_TX_DENOM`**, returning
`ZONA 1 GRADO 3º` / `ZONA 8 GRADO 2º NIVEL a`, and scores it **100%**.

If that field is real, **one of batch 2's declared extraction tasks is already solved by GIS** — no
ordinance read needed. Cheap to verify (a single `MapServer/0` query returning both fields) and worth
doing before anyone opens the PDF for it.

### C-8 — CONTRADICTION: the Catastro/REFCAT join is reversed between batches

| Batch 2 (§WS7) | Batch 3 (PART B) |
| -------------- | ---------------- |
| Build a **Catastro connector**; `parcelSource.identifier = "REFCAT"`; flow `User click → Catastro parcel → centroid → Madrid GIS` | **"Madrid does NOT use Catastro refcat as join."** Flow `clicked coordinate → NORMAS_ZONALES → CONDICIONES_EDIFICACION`. Explicitly **NOT** `refcat → CODMANZANA` |

These are not compatible architectures. Batch 3 is later and more specific, and its version is
simpler (no Catastro dependency, no licence question on the join path). But batch 2's Catastro need
was partly about the **user-facing parcel boundary**, which batch 3's flow does not supply — so this
may be two different requirements talked past each other rather than a straight reversal.
**Do not implement either until this is settled**; it determines whether Madrid needs a Catastro
licence at all, which is itself an open PART-B item.

### C-9 — PARTIALLY RESOLVES C-5: zones 2 and 6 exist in the ordinance

C-5 flagged zones **2, 6, 10, 11** as absent from the GIS vocabulary with the cause unresolved.
Batch 3 §3 lists the Título VIII chapter map and it includes **`8.2 Norma Zonal 2`** and
**`8.6 Norma Zonal 6`**.

So NZ2 and NZ6 are *legally real* — they have their own ordinance chapters. Their absence from
`AMB_TX_ETIQ` is therefore **not** "these zones don't exist". Remaining possibilities: inactive/
superseded in the current plan, or present in the city but unobserved in the sampled GIS response.
The second would mean parcels that route nowhere. Zones **10 and 11** remain entirely unexplained —
the chapter map stops at 8.8.

### C-10 — A fourth scoring scale; C63 remains the ratified basis

Batch 3 introduces two more scales (`GIS 95% / LAW 40% / TOTAL ~65%`, and `complete engine 35–40%`),
and internally disagrees with itself on NZ1 geometry (**100%** in §A's scoring table vs **80–90%** in
§B's). That is now four mutually inconsistent completeness scales across three batches. Per C-2 this
changes nothing: **score on C63's 7 ratified axes** and record the founder's figures as
"as-supplied, differing basis".

### C-11 — The convergence worth acting on

Batch 3's *"legal-to-JSON compiler, not a GIS discovery problem"* and its
`PDF → chapter splitter → zone classifier → parameter extractor → validation → JSON` pipeline is
**structurally the same machine** as the Berlin/Germany ordinance-extraction pipeline currently being
built in `packages/ordinance-extraction/` (born-digital text-parse path + per-locale grammar, gated
by `localeGate`). Batch 3 independently arrives at the same architecture for Spanish.

If the German adapter contract holds as designed, **Madrid should be a Spanish grammar plus a
`Título VIII` chapter classifier on the existing pipeline — not a second parser.** That is the single
highest-leverage cross-jurisdiction observation in this batch, and it is the reason the Germany work
was scoped as "the shared unlock" rather than a Berlin one-off. Worth an explicit test before anyone
writes Madrid-specific extraction code.

**Caveat, honestly:** Berlin is a *bplan* PDF and Madrid is a *consolidated city-wide ordinance* —
different document shapes. The pipeline reuse claim is a hypothesis, not a verified finding.
