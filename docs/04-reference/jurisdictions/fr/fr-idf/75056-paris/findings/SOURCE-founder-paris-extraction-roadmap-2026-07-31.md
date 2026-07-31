# SOURCE — Founder: Paris (75056) production extraction roadmap (raw capture)

> **Provenance.** Founder-provided research, delivered 2026-07-31. Captured **verbatim** in §A.
> §B is mine and is marked as such.
>
> ✅ **This is CONSISTENT with the existing [`../RATE-IMPLEMENTATION-PLAN.md`](../RATE-IMPLEMENTATION-PLAN.md)**
> (~35% now, ~55–60% ceiling, ADR-0274 as the gating KIND). It refines and extends it rather than
> competing — notable, given how many models conflicted elsewhere today. Deltas are itemised in §B.
>
> Country-level context:
> [`../../findings/SOURCE-founder-france-tiered-scoring-and-roadmap-2026-07-31.md`](../../findings/SOURCE-founder-france-tiered-scoring-and-roadmap-2026-07-31.md) ·
> [`../../findings/SOURCE-founder-france-machine-readable-legislation-schema-2026-07-31.md`](../../findings/SOURCE-founder-france-machine-readable-legislation-schema-2026-07-31.md)

**Discipline observed, and worth recording:** the source explicitly refused to produce numeric values
past the point of verification — *"I will **not** invent any numeric values that have not yet been
verified from the PLU Bioclimatique."* Every ordinance-derived field below is `unknown`. That is the
correct failure.

---

## §A — Verbatim

### PART A — LEGISLATION · Zone UG (Urban General)

| Field | Value | Source status |
|---|---|---|
| `zoneCode` | UG | **VERIFIED** (GPU) |
| `officialDesignation` | Urban General Zone (PLU Bioclimatique) | **VERIFIED** |
| `farRatio` | **n/a** | **VERIFIED** — ALUR abolished COS nationally |
| `densityScope` | n/a | **VERIFIED** |
| `maxHeight_m` | unknown | requires UG.10 |
| `heightMeasurement` | *Surface de nivellement de l'îlot* + gabarit formula | **structure VERIFIED, numeric values NOT VERIFIED** |
| `maxFloors` | unknown | UG.10 not extracted |
| `maxCoverage` | unknown | UG.9 not extracted |
| `frontSetback` | unknown | UG.6 not extracted |
| `rearSetback` / `sideSetback` | unknown | UG.7 not extracted |
| `buildableDepth_m` | unknown | not identified in primary text |
| `permittedUse` | unknown | zone chapter not extracted |
| `legalSource` | PLU Bioclimatique de Paris | **VERIFIED** |
| `article` | UG.6–UG.10 | PENDING |
| `effectiveDate` | unknown | not verified |
| `confidence` | Medium | GIS verified; ordinance not transcribed |

**Zones UGSU / UV / N** — height, coverage, setbacks, uses all `unknown`; each requires its own
chapter extraction. UV: *"landscape likely dominant"*. N: natural zone, numeric parameters unknown.

### Height extraction pipeline — three independent official datasets

| Layer | Content | Machine-readable today | Missing |
|---|---|---|---|
| **`plub_filet`** | envelope rule per **street segment**, coded `M · K · C · B · G` | geometry ✅ · code ✅ · **numeric height ❌ · formula ❌** | **UG.10 decoding table** |
| **`plub_hauteur`** | **116 polygons**, absolute metre values, official | ✅ | relationship to UG zones · **priority rules** · applicability |
| **`plub_hmc`** | **NGF datum**, maximum constructible altitude, official | ✅ | **priority over `plub_filet`** · **priority over `plub_hauteur`** · applicable sectors |

### Missing legislative extraction — per article

| Article | Must extract |
|---|---|
| **UG.6** | rule type · front setback · exceptions · geometry references · article · paragraph |
| **UG.7** | side setback · rear setback · distance formulas · exceptions · cross references |
| **UG.8** | building spacing · same parcel · minimum distance · conditions |
| **UG.9** | coverage · emprise · open space · landscape ratio · permeability |
| **UG.10** | *largest article* — facade height · envelope · reference surface · street width · prospect distance · maximum height · special sectors · exceptions · **figures · tables** · cross references |

### Formula objects — **do NOT flatten formulas into numbers**

```json
{ "ruleType":"formula", "zone":"UG", "article":"UG.10",
  "expression":"unknown", "variables":["P","D"],
  "referenceSurface":"Surface de nivellement de l'îlot",
  "status":"pending ordinance extraction" }
```

### GIS objects — stored separately

Zoning `GPU` (polygon, official) · Parcels `Cadastre` (official, national) · Buildings `BD TOPO`
(measured height, storeys, official) · Height envelope `plub_filet` · Height ceiling `plub_hauteur` ·
Max constructible altitude `plub_hmc`.

### Overlay objects — **independent objects, not fields on a zone**

ABF (*Architectes des Bâtiments de France*) · PSMV (*secteurs sauvegardés*) · Fuseaux de protection ·
Maisons/Villas sectors · Montmartre sector · flood and other SUP overlays.

Each carries: `overlayId` · `overlayType` · `geometry` · `legalEffect` (text from ordinance) ·
`legalSource` · `article` · `paragraph` · **`priority` (rule precedence)** · `confidence`.

### Remaining tasks

Extract UG.6 · UG.7 · UG.8 · UG.9 · UG.10 · decode `plub_filet.haut` letters · build formula lookup
table · link GIS features to ordinance articles · verify PSMV GIS coverage · verify ABF overlay
queries · record ordinance version and effective date. **All PENDING.**

### Estimated completion

| Component | Current | Target |
|---|---:|---:|
| Official GIS | 100% | 100% |
| Parcel data | 95% | 100% |
| Zone identification | 100% | 100% |
| Height GIS | 100% | 100% |
| **Height legal decoding** | **0%** | 100% |
| Coverage rules | 0% | 100% |
| Setback rules | 0% | 100% |
| Use regulations | 0% | 100% |
| Legal citations | 10% | 100% |
| **Machine-readable buildability** | **~35%** | **~55–60%** (documented Paris ceiling) |

---

## §B — Capture notes (MINE, not the founder's)

### P-1 — Consistent with the existing RATE plan; three genuine additions

No conflict with `RATE-IMPLEMENTATION-PLAN.md` (2026-07-24): both say ~35% today, ~55–60% ceiling,
ADR-0274 as the gating KIND, `plub_filet` as the largest lever. **Three things are net-new:**

1. **UG.8 (building spacing, same parcel)** — the RATE plan scopes UG.6/7/9/10 only. UG.8 is
   additional extraction scope, uncosted in Phase 2.
2. **The overlay object schema** with an explicit `priority` field — the RATE plan treats ABF/PSMV as
   a *risk* to be flagged; this makes them first-class objects with precedence.
3. **`plub_hmc` precedence** as an explicit open question (see P-2).

### P-2 — The three-layer precedence question is the highest-value unknown, and it may not need the PDF

Paris publishes **three** height datasets that can all apply to one parcel:

```
plub_filet   (coded envelope, street segment)
plub_hauteur (116 polygons, absolute metres)
plub_hmc     (NGF datum, max constructible altitude)
```

**Which wins when they disagree is unresolved** — and a wrong answer is silently wrong, exactly the
L-616 shape (a plausible height with no error raised). The RATE plan's Phase 1 probes whether
`plub_hauteur` exists as a GIS layer; it does **not** frame precedence as the question.

**Denmark's lesson applies directly and cheaply.** The byggefelt bindingness question looked like a
legal problem and was answered by `DescribeFeatureType` in minutes — Plandata published it as two
booleans nobody had read. **Before assuming UG.10 must be read to resolve precedence, probe the three
layers' schemas and metadata** (opendata.paris.fr / GPU WFS): look for priority, applicability,
sector, or validity attributes. If any layer carries a precedence field, the question is answered
without opening a PDF.

This is a **half-day probe that could reorder Phase 1**, and it is the single cheapest high-value
action available on Paris.

### P-3 — Component targets at 100% vs a composite ceiling of 55–60% needs its reconciliation stated

The table sets *height legal decoding · coverage · setbacks · uses · citations* all to **100%**, yet
machine-readable buildability to **55–60%**. Both can be true — the gap is the **ABF/PSMV
discretionary residual** plus parcels where the gabarit formula yields no result — but the table does
not say so, and read alone it looks like an arithmetic error.

The RATE plan explains it (~700 classified monuments × 500 m ABF perimeters, where the correct output
is a *flag*, not a number). **That explanation belongs next to the numbers**, or the composite will be
challenged as inconsistent.

Note this is also the France country-level tier model working correctly: those parcels are **Bronze**
(zoned, ordinance identified) and can never be **Gold**, by law rather than by data gap.

### P-4 — The formula object with `"expression":"unknown"` is exactly right

`{ ruleType: "formula", expression: "unknown", status: "pending ordinance extraction" }` is the
country-level **rule-typing** principle applied correctly: the rule is **fully represented as a
structured object** while its value remains honestly absent. It is not `null`, not `0`, and not a
guessed formula.

This is also the strongest argument for restoring **`unknown`** to the France rule taxonomy (capture
note F-9) — here the type is *known* (`formula`) and the *expression* is unknown, which the seven-type
list can express but a value-only schema cannot.

### P-5 — The Madrid PDF precedent applies directly to UG.6–UG.10

Madrid's Compendio hit a web-fetch extraction ceiling at ~page 270 of 626, and was solved by
downloading the 24.5 MB PDF locally and paging through it with PyMuPDF — **born-digital, no OCR
needed**. UG.6–UG.10 of the PLU Bioclimatique is the same shape of problem and the same tools are
already installed (`pdftotext`, `fitz`, `pypdf`).

**Blocker: I do not have a verified URL for the PLU Bioclimatique PDF**, and will not guess one.
Supply it (or authorise a search) and UG.6/7/8/9/10 can be extracted the same way Madrid's Título VIII
is being extracted now.

⚠ One difference to expect: **UG.10 contains figures and tables** (the source says so explicitly).
Madrid's blocker was locating chapters in a text layer; Paris's will likely be **table and diagram
recovery**, which is the capability currently scored at **0%** across the whole programme and is the
same gap as Germany's *Nutzungsschablone*. Paris may be a better first test of a table extractor than
Madrid, precisely because the tables are known to be load-bearing here.

### P-6 — Two claims worth verifying rather than inheriting

- **`farRatio = n/a` because "ALUR abolished COS nationally"** is marked VERIFIED. The ALUR law (2014)
  did abolish the *coefficient d'occupation des sols*, so this is very likely correct — but it is a
  **legal claim recorded without a citation**, and it is the only field in PART A asserted as settled
  without an article reference. Cheap to close: add the ALUR article. Worth doing, because "no FAR in
  France" is a load-bearing simplification for every French city pack.
- **`plub_hauteur` = 116 polygons** is a precise count with no stated query. One `resultType=hits`
  confirms it. (Today's byggefelt lesson: a head sample said 88% where the true figure was 24% —
  **always count, never sample**.)
