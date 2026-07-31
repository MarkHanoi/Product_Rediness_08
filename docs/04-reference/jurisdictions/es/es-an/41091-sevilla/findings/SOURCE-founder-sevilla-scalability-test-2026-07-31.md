# SOURCE — Founder: Sevilla as the Scalability Test + 10-Phase Recon Plan (raw capture)

> **Provenance.** Founder-provided research, delivered 2026-07-31 (batch 18, two messages).
> Captured **verbatim** in §A–§B. §C is mine and is marked as such.
>
> ⚠ **Naming collision — read S-1 in §C before using the hypothesis labels.** This batch defines
> **H1–H5** at *city* scope. A previously committed capture defines a **different H1–H4** at *national*
> scope. Same labels, different claims.
>
> Related: [`../../../findings/SOURCE-founder-spain-compiler-hypotheses-H1-H4-2026-07-31.md`](../../../findings/SOURCE-founder-spain-compiler-hypotheses-H1-H4-2026-07-31.md) ·
> [`../../../findings/SOURCE-founder-spain-city-selection-and-adapter-metric-2026-07-31.md`](../../../findings/SOURCE-founder-spain-city-selection-and-adapter-metric-2026-07-31.md) ·
> Madrid corpus at [`../../../es-md/28079-madrid/findings/`](../../../es-md/28079-madrid/findings/)

**The thesis, quoted:**

> Sevilla is an excellent test because it is **not Madrid**, yet it belongs to the same Spanish
> planning ecosystem. If the architecture survives Sevilla with minimal adaptation, that is much
> stronger evidence of scalability than simply adding another city with identical data.
>
> **I would rate Sevilla as a 9/10 scalability test.**
>
> If the compiler still works, **you're no longer proving Madrid — you are proving Spain.**

Why 9/10: different municipality · **different autonomous community (Andalusia)** · different planning
authority · different GIS implementation · **same legal tradition** · **same core planning concepts**.

---

## §A — Batch 18a: expected reuse assessment

### Expected planning stack — *"almost identical to Madrid conceptually, even if the documents and endpoints differ"*

```
National legislation → Andalusian urban legislation → PGOU Sevilla
  → Normas Urbanísticas → Official GIS
```

### Ontology reuse — *"your internal schema does NOT change. Only the extraction changes."*

`zoneCode` · `officialDesignation` · `maxHeight` · `maxFloors` · `FAR/edificabilidad` · `coverage` ·
`front setback` · `rear setback` · `side setback` · `permittedUse` — **all ✓ Madrid, all ✓ expected Sevilla.**

### GIS discovery — semantic scoring, not hard-coded names

| Layer name contains | Score |
| ------------------- | ----: |
| Zona | +20 |
| Ordenación | +20 |
| Urbanística | +20 |
| Planeamiento | +20 |
| Edificación | +20 |

Highest-scoring layer becomes the **Zone Layer**. *"This is exactly what worked in Madrid."*

### Layer classification — *"No Sevilla-specific code required"*

| Sevilla publishes | Classifier maps to |
| ----------------- | ------------------ |
| Planeamiento General | Zone Layer |
| Ordenación Pormenorizada | Envelope Layer |
| Calificaciones Urbanísticas | — |
| Alineaciones | Alignment Layer |
| Usos | Uses Layer |
| — | Management Layer |

### Field discovery

Madrid's `AMB_TX_ETIQ` → `zoneCode`. Sevilla's might be `COD_ZONA`, `CALIFICACION`, or `CLAVE`.
**The semantic mapper handles this.**

### Legal parser reuse — *"probably the biggest reuse win"*

> The parser already knows to look for *Altura*, *Número máximo de plantas*, *Edificabilidad*,
> *Ocupación*, *Retranqueo*, *Usos permitidos*. **These are not Madrid-specific. They are Spanish
> planning language.** Therefore the extraction prompts barely change.

### Citation engine & compiler — **no changes**

```json
{ "document":"PGOU Sevilla", "article":"6.2.15", "paragraph":"3" }
```

### Expected differences — all handled by mapping, not new code

| Aspect | Madrid | Sevilla |
| ------ | ------ | ------- |
| Zone names | `1.1`, `4`, `8.2.a` | may use `MC`, `SU`, `RU`, `IND`, `TER` |
| Article numbering | `8.4.12` | `6.5.18` |
| GIS fields | `AMB_TX_ETIQ` | `CODIGO` |
| Legal layout | Chapter 8 | Title VII |

> The parser already identifies **structural elements** rather than fixed chapter numbers.

### Estimated reuse

| Component | Reuse |
| --------- | ----: |
| ArcGIS client · Geometry engine · Spatial routing · Citation engine · Rule JSON schema · **Ontology** | **100%** |
| GIS discovery | 90–95% |
| Legal parser · Parameter extraction | 85–90% |
| City-specific adapter | **10–15% new** |

> **Overall: around 85–90% code reuse from Madrid.**

### The five city-scope hypotheses (define before writing code)

| # | Hypothesis | Target |
| - | ---------- | ------ |
| **H1** | Can discovery automatically identify the zoning layer **without manual configuration**? | YES |
| **H2** | Can every planning parameter map into the existing schema? | **100%** |
| **H3** | Can the Madrid legal parser extract Sevilla's rules **without adding new extraction patterns**? | **>90%** |
| **H4** | Can every extracted numeric value link to official document + article + paragraph? | **100%** |
| **H5** | How much Sevilla-specific code is required? | **<200 lines** |

### What success would mean

> * The GIS discovery algorithm **generalizes across municipalities.**
> * The planning ontology is **national rather than city-specific.**
> * The legal parser understands **Spanish planning language**, not Madrid's ordinance alone.
> * New cities primarily require **configuration** (layer names, field mappings, document URLs), **not
>   new algorithms.**
>
> The strongest next validation after Sevilla would be a **Catalan city such as Barcelona or Girona**,
> because Catalonia's planning framework (**POUM** and related instruments) is structurally different
> enough to test whether the compiler can adapt beyond the **Castilian/Andalusian PGOU model.**

---

## §B — Batch 18b: the 10-phase reconnaissance plan

### Phase 1 — GIS Intelligence Reconnaissance

> Answer **only** these questions. **Nothing more.**

Where is the official GIS? · What services exist? · Zoning layers? · Parcel layers? ·
Planning-management layers? · Geometry layers? · Legal identifiers?

**Step 1 — discover every service.** Madrid gave `PGOUM97`, `NORMAS_ZONALES`,
`CONDICIONES_EDIFICACION`, `ORDENACION`, `USOS`. Sevilla's deliverable is `SERVICES.md`:

```yaml
Service:  Planeamiento
Layers:   Zonas · Ordenación · Catálogo · Alineaciones · Gestión
```

**Step 2 — classify layers automatically.** *Calificación Urbanística* → `ZONE_LAYER`;
*Alineaciones* → `ALIGNMENT_LAYER`; *Planeamiento Especial* → `SPECIAL_PLAN_LAYER`.
**Now every city has a normalized inventory.**

**Step 3 — field inventory.** Per layer collect `field`, `type`, `alias`, `domain`, `nullable`;
then classify (`CODE` / `HEIGHT` / `USE` …). Example: `CODIGO`, String, alias *Clave Urbanística*.
**The classifier becomes reusable nationally.**

**Step 4 — geometry inventory.** Polygons? Lines? Points? Multipart? Closed rings? EPSG?
Generalized geometry? Metadata? *"Exactly what was done for Madrid NZ1."*

**Step 5 — relationship discovery.** Madrid taught `Catastro → spatial → CODMANZANA → NUMORD`.
For Sevilla: `Parcel → ? → Planning identifier`. **"Never assume. Need to prove."**

### Phase 2 — Legal Intelligence

> Now ignore GIS. Work only on legislation. **Instead of immediately extracting values, build structure.**

`Title → Chapter → Section → Article`, then classify every chapter as
*Definitions · Zones · Uses · Heights · Setbacks · Procedures · Industrial · Historic*.

> Now every article has a **semantic tag** instead of only "Article 6". **This dramatically improves extraction.**

### Phase 3 — Legal ontology

Madrid produced *Altura · Plantas · Retranqueo · Edificabilidad · Ocupación*.
Does Sevilla introduce new concepts — *Patio · Medianera · Alero · Cornisa*?

> If yes, **extend ontology. Not parser. Ontology.**

### Phase 4 — Parameter extraction

**Only chapters tagged `Zone Regulations` are processed.** Per zone extract Height, Coverage, Depth,
Setbacks, Uses, FAR — **always with Article + Paragraph. Never infer.**

### Phase 5 — Zone compiler

```json
{ "zoneCode":"MC",
  "height":{ "value":16, "article":"6.2.12" },
  "coverage":{ "value":80, "scope":"parcel" } }
```

> **Exactly same compiler as Madrid.**

### Phase 6 — Cross validation

GIS says parcel → `MC`; compiler says `MC`; load height/coverage/FAR. **Everything joins. No manual lookup.**

### Phase 7 — Special plans — *"probably Sevilla's biggest unknown"*

Classify General Plan → Special Plan → Historic Centre → Industrial → Protected Landscape.

> **Almost certainly GIS detectable**, exactly like Madrid's `APR` / `APE` / `API` → `derived-plan` flags.

### Phase 8 — Confidence scoring, machine-generated

| Confidence | Basis |
| ---------: | ----- |
| 100 | Exact numeric |
| 95 | Table extraction |
| 80 | Text extraction |
| 60 | Ambiguous wording |
| **Unknown** | **No legal value** |

### Phase 9 — City adapter — *"surprisingly small"*

```yaml
city:              Sevilla
zoneLayer:         Planeamiento/Zonas
codeField:         CODIGO
designationField:  DENOM
legalDocument:     PGOU Sevilla
language:          es
crs:               EPSG:25830
```

> **Everything else belongs to the compiler.**

### Phase 10 — National comparison — *"This is the proof you want"*

GIS discovery · ArcGIS client · Geometry parser · Article parser · Citation engine · Rule compiler ·
Ontology → **same**. Adapter → **different**.

### The five strategic questions Sevilla answers

1. Do Spanish municipalities expose planning through **comparable GIS services**? → discovery layer reusable
2. Do ordinances express quantitative rules with a **common legal vocabulary** (*altura*, *edificabilidad*, *ocupación*, *retranqueo*, *plantas*)? → ontology is national
3. Can the same **article-to-JSON compiler** extract numerics without city-specific logic? → compiler generalizes
4. Can GIS zoning codes be **deterministically joined** to legal rule tables? → runtime becomes standard
5. **How much city-specific configuration remains?** → realistic target: declarative adapter of **~100–300 lines**, no new parsing algorithms

---

## §C — Capture notes (MINE, not the founder's)

### S-1 — LABEL COLLISION: two different H1–H4/H5 sets now exist. Do not merge them.

This is a documentation hazard that will cause real confusion if left unflagged.

| | **National** H1–H4 (committed earlier) | **City** H1–H5 (this batch) |
| - | -------------------------------------- | --------------------------- |
| Scope | Spain-wide, across **20 municipalities** | **One city** (Sevilla) |
| H1 | GIS convergence — sample 20, pass 16/20 | Discovery finds the zoning layer without manual config |
| H2 | Legal convergence — cluster headings from 20 ordinances | Every parameter maps into the existing schema (100%) |
| H3 | Parser reuse ratio >85–90% after several cities | Madrid parser extracts Sevilla rules, no new patterns (>90%) |
| H4 | Deterministic compilation — 100% citations, 0 inferred | Every numeric links to document+article+paragraph (100%) |
| H5 | *(does not exist)* | Adapter <200 lines |

They are **compatible but not identical** — the city set is roughly a single-city instance of the
national set, plus the adapter metric. **Recommend renaming on adoption**: `NH1–NH4` (national) and
`CH1–CH5` (city), so a Sevilla result can never be quoted as evidence for a Spain-wide claim. The
national H1 explicitly requires 20 municipalities; one city passing its own H1 proves nothing about it.

### S-2 — Sevilla's position in the sequence has moved, again

The city-selection batch put Sevilla at **#5** (after Madrid → Barcelona → València → Zaragoza), with
València as *"probably the ideal second implementation."* This batch treats Sevilla as the immediate
next test and rates it **9/10**.

Both arguments are sound and they optimise for different things: **València** tests the *average*
Spanish city (maximum reuse, cleanest proof of the happy path); **Sevilla** tests a *different
autonomous community* (regional legal variation — a harder, more informative test).

Worth noting a practical asymmetry the corpus does not mention: **València already has a P4.5 recon
gate scheduled in its RATE plan** from this same delivery. Sevilla does not. Running València first
costs nothing extra; making Sevilla second-city means adding a gate there and deferring an already-
planned one. That is a scheduling argument, not an architectural one — but it favours València.
**This is the sixth sequencing shift in the corpus** (see C-25, C-31) and remains the founder's call.

### S-3 — "Extend ontology, not parser" (Phase 3) is the sharpest operational rule in the batch

*Patio · Medianera · Alero · Cornisa* as candidate new Sevilla concepts, handled by **extending the
ontology rather than the parser**, is exactly the discipline that keeps adapter size at <200 lines.
If new vocabulary reaches the parser, H5/CH5 fails by construction and every subsequent city inherits
the bloat.

Two observations:

- **`Cornisa` is not new.** It already appears throughout the Madrid corpus as the height *measurement
  datum* (`altura de cornisa`). Its reappearance as a candidate "new Sevilla concept" suggests the
  ontology's existing entries are not yet written down anywhere checkable — which is itself the
  argument for building the ontology registry before the second city, not after.
- **`Medianera` (party wall) is genuinely new** and is *not* a measurement — it is a placement
  condition. It maps to the same territory as Madrid NZ4's `sideTreatment: "party-wall"` and Denmark's
  placement vocabulary shipped this session. Third jurisdiction, same concept, three different names.

### S-4 — Phase 7 (special plans) is correctly flagged as the biggest unknown, and it is where I'd expect the reuse estimate to break

The 85–90% reuse figure assumes Sevilla's special-plan instruments are GIS-detectable "exactly like
Madrid's APR/APE/API". That is an **assumption carried forward as a premise**, and it is the same
class of assumption that made Barcelona hard mode (`MPGM/PEU/PMU` hierarchies that the founder's own
city-selection batch predicted would cost a 450-line adapter — 2.25× Sevilla's target).

Andalusia has its own planning instrument names, and nobody has checked them. If Sevilla's special
plans turn out to be hierarchical rather than flag-shaped, Sevilla inherits Barcelona's problem and
the 9/10 rating is optimistic. **Phase 7 should run early in the recon, not at position 7** — it is
the item most likely to invalidate the estimate, and cheap to check against the GIS layer inventory
produced in Phase 1.

### S-5 — What is genuinely reusable from this batch regardless of sequencing

Independent of which city runs next, three artefacts here are directly usable:

1. **The layer-scoring table** (*Zona/Ordenación/Urbanística/Planeamiento/Edificación* +20 each) —
   a concrete first-cut scoring function for the discovery engine, complementing the
   `CALIFICACION/ZONIFICACION/ORDENANZA/NORMA/AMBITO` heuristics from the earlier batch.
2. **The confidence ladder** (100 exact / 95 table / 80 text / 60 ambiguous / unknown) — note it puts
   **table extraction above free-text**, which corroborates D7's claim that tables are the higher-accuracy
   path and reinforces that the table-ratio count is the cheapest high-value measurement available.
3. **The adapter YAML shape** — seven declarative fields. This is the concrete form of the <200-line
   metric and could be schema-checked in CI from day one.

### S-6 — Standing recommendation unchanged

Nothing here alters the three cheap empirical items I've recommended throughout: **València P4.5 recon
(= national H1's test), the Compendio table-ratio count (D7), and the Compendio version resolution
(C-6/C-16).** Sevilla is a strong *second* validation and this recon plan is the right shape for it —
but it is a plan for work that should follow the first empirical result, not precede it.

**Still nothing built.** Eighteen batches, eleven capture files, zero code, zero ratified decisions.
