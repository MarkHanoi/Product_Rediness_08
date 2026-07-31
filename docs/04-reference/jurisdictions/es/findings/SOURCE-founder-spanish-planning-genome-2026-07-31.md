# SOURCE — Founder: THE SPANISH PLANNING GENOME (raw capture)

> **Provenance.** Founder-provided research, delivered 2026-07-31. Captured **verbatim** in §A.
> §B is mine and is marked as such.
>
> **Filed at COUNTRY level deliberately.** The founder's instruction was explicit:
> *"what we are doing for madrid / valencia is the SPANISH GENOME — BASICALLY MEANS COULD SCALE
> EVERYWHERE — DOCUMENT ACCORDINGLY."* This is Spain-wide architecture, not Madrid or València data.
> The city-level captures that led here live under
> [`es-md/28079-madrid/findings/`](../es-md/28079-madrid/findings/) and
> [`es-vc/46250-valencia/findings/`](../es-vc/46250-valencia/findings/).

**The thesis, quoted:**

> This is where the project becomes much more ambitious than "extract planning rules." The next layer
> is to **treat Spanish planning systems as a compilable language.**
>
> Berlin has already shown this on the German side. Madrid suggests **Spain may be even more
> structured**, because many municipalities use similar legal concepts and increasingly publish
> ArcGIS services.

---

## §A — Phases 26–40: the Genome (verbatim)

### 26 — The Spanish Planning Genome

> Instead of storing thousands of rules, identify the small number of planning **primitives** that
> every municipality reuses.

```
Maximum Height          Front Setback        Permitted Uses
Maximum Floors          Rear Setback         Conditional Uses
Maximum FAR             Side Setback         Prohibited Uses
Maximum Coverage        Buildable Depth      Protection Level
Alignment Rule          Volume Rule          Special Plan Override
Interior Patio Rule
```

> That is probably only **20–40 primitive rule types.** Everything in Madrid, Valencia, Sevilla,
> Zaragoza, Bilbao, etc. becomes **a different parameterization of the same primitives.**

### 27 — The Spanish Planning Taxonomy

Madrid revealed `Norma Zonal → Grado → Nivel`. **That is not unique to Madrid** — every municipality
has something similar. The compiler normalizes:

| City | Local code | Canonical |
| ---- | ---------- | --------- |
| Madrid | `1.2` | `ResidentialHistoric` |
| València | `ENS-2` | `ResidentialHistoric` |
| Bilbao | `R3` | `ResidentialHistoric` |

> Internally they become `ResidentialHistoric`, not `1.2`. **The local code is preserved for provenance.**

### 28 — Detect Municipal Families

> Something I haven't seen documented, but I think it is achievable.

Madrid → `PGOUM`; Valencia → `PGOU`; Sevilla → `PGOU`. Different cities, very similar terminology.

> The compiler should discover `Family A → shared ontology → shared parser`, instead of writing a
> Madrid parser **and** a Valencia parser **and** a Sevilla parser.

### 29 — Article Graphs

Instead of parsing PDFs sequentially: `Article 8.1 → references → Article 7.2 → references → Annex III`.

> The ordinance becomes a graph. Now you can answer *"Where does maximum height come from?"* without
> searching manually.

### 30 — Parameter Provenance Graph

```
22 m → Article 8.3.5 → Table 2 → Compendio → Version 2025
```

> instead of `22`. **That is a huge competitive advantage.**

### 31 — GIS Provenance Graph

```
ZoneCode → Layer → Field → Feature → ObjectID → Service
```

> You never lose provenance.

### 32 — Rule Conflict Engine

Rather than hardcoding precedence, `Rule A priority 10` / `Rule B priority 30`, compiler resolves
automatically. **Madrid already hints at this through `APR` / `APE` / `API`.**

### 33 — Exception Detection

Identify *Exception*, *Variance*, *Special condition*, *Only if*, *Unless* — **these become explicit objects.**

### 34 — Rule Coverage Map

> Madrid 95% — **but where?** Generate GIS: 🟢 fully compiled · 🟡 missing one parameter · 🔴 special plans.
> **This immediately shows where engineering effort is best spent.**

### 35 — Automatic Rule Testing

`Parcel → GIS → Compiler → Expected rule → Compare against ordinance` — **a regression suite for planning.**

### 36 — Cross-City Comparison

Once Madrid and Valencia exist: *"Show all cities where Maximum coverage >70%"* · *"Cities using
buildable depth"* · *"Cities with alignment-based regulation."* **Requires normalized parameters.**

### 37 — National Completeness Metrics

Measure each **independently**: GIS completeness · Legal completeness · Citation completeness ·
Topology completeness · Parameter completeness · Override completeness · Machine-readability.

### 38 — Knowledge Reuse

> Suppose Valencia introduces *Retranqueo posterior*. The parser already knows *Retranqueo* → `Setback`.
> **No retraining. Every city improves the compiler.**

### 39 — Spanish Planning Language Model (**not an LLM**)

> A **deterministic** language model: vocabulary, grammar, articles, tables, cross references, defined
> terms. **Think of it as a compiler front-end, similar to how a programming language parser works.**

### 40 — The Compiler Architecture

```
Official GIS → GIS Discovery Engine → Planning Ontology
                                            ↑
Official Ordinance → Legal Structure Parser ┘
   → Parameter Extraction → Citation Validator → Rule Normalization
   → Rule Conflict Engine → Coverage Analyzer → Human Verification Layer
   → Production Rule Pack → Buildability Engine
```

### Why Madrid was the right first city

> Madrid wasn't just another municipality. It answered several **foundational** questions:
>
> * Planning data **can be discovered automatically** from municipal GIS.
> * **Spatial joins** can replace fragile identifier joins.
> * **GIS and legal texts complement each other** — GIS provides topology and geometry, the ordinance
>   provides normative parameters.
> * **The same ontology can bridge both sources.**
>
> Those are **architectural discoveries, not just city-specific findings.**

### What València must validate

> If Madrid was the proof that the architecture *can* work, Valencia should be the proof that it
> **generalizes**. The milestone is not "Valencia reaches 95%". It is:
>
> **A second Spanish city can be compiled using the same discovery engine, ontology, legal parser,
> and rule compiler, with only city-specific configuration and validation.**
>
> If you achieve that, adding a third city should require **an order of magnitude less engineering
> effort** than Madrid did. That's the point where you've built a **Spanish planning compiler**, not
> just a collection of municipal integrations.

---

## §B — Capture notes (MINE, not the founder's)

### G-1 — The Genome framing is right, and it names something PRYZM has been circling

The "20–40 primitives, everything else is parameterization" claim is the correct abstraction, and it
is worth stating plainly why: it converts jurisdiction onboarding from **N × research projects** into
**one compiler + N configurations**. That is the same economic shape as the Envelope Replication
Standard's five slots (ADR-0279), one level up — ADR-0279 made *envelope onboarding* repeatable;
the Genome proposes making *legislation onboarding* repeatable.

**But note what has actually happened three times this session.** Denmark needed a per-parcel
placement resolver Barcelona did not. Madrid needs grade inheritance (`Zona → Grado → Nivel`)
Barcelona does not. Berlin needed a bplan-shaped document model Madrid does not. Each time, the
shared spine held and the *jurisdiction-shaped* part lived in one slot. That is evidence **for** the
Genome — the primitives really are stable — and simultaneously a warning that the per-city
configuration is not as thin as "only city-specific configuration and validation" implies.

### G-2 — The single most testable claim, and the cheapest way to test it

§27's taxonomy table is the crux: Madrid `1.2`, València `ENS-2`, Bilbao `R3` all → `ResidentialHistoric`.

That mapping is **asserted, not demonstrated**. Nobody has confirmed València uses `ENS-2` or Bilbao
uses `R3` — those are illustrative placeholders in the source. València's P4.5 recon gate (added to
its RATE plan this session) is exactly the probe that settles it, and it is 1–2 days.

**Recommended success metric for P4.5, stated in advance so it cannot be rationalised after the fact:**
if the Madrid-derived heuristics (`AMB_TX_ETIQ`/`AMB_TX_DENOM`, plus `CALIFICACION`/`ZONIFICACION`/
`ORDENANZA`/`NORMA`/`AMBITO`) locate València's zoning layer **without bespoke research**, the Genome
thesis holds and the 100→30 effort estimate is credible. If they do not, the thesis needs revising
*before* it is used to plan the Spanish rollout — not after three cities have been costed against it.

### G-3 — Known counter-evidence that must not be lost in the ambition

Three items in this repo cut against a frictionless Genome. None kills it; all three bound it:

| Counter-evidence | Consequence for the Genome |
| ---------------- | -------------------------- |
| **Barcelona `edificabilitat` is a CONSTRUCTION, not a lookup** (ADR-0271; Art. 242.2 is an *algorithm*) | A vocabulary map *edificabilidad* → `MaximumFAR` reads it as a **value** and is silently wrong. §26's primitives need an `AlgorithmicRule` primitive, or Barcelona is a permanent exception. |
| **Madrid/Córdoba are blocked by DISSOLVE, not rules** | The Genome addresses the *legislation* axis only. Two Spanish cities are stuck on **geometry**, which no amount of ontology fixes. |
| **Street width has no national source and must be CONSTRUCTED** | Same shape — a derived input the compiler cannot source. |

**Honest restatement of the scaling claim:** effort reduction is real and probably large **for the
legislation axis**; it is **unproven for the geometry/data axes**, which is where Spain's current
blockers actually sit. The Genome should be sold internally on that basis, or the first city it fails
to accelerate will discredit a sound idea.

### G-4 — §39's "deterministic, not an LLM" is the most important sentence here

A deterministic compiler front-end — vocabulary, grammar, cross-references, defined terms — is
falsifiable, testable, and citable. An LLM-only extractor is none of those. This aligns exactly with
batch 6's *"the LLM proposes, the validator decides"* and with the Denmark resolver's four invariants
shipped this session (source hierarchy with a proven-bindingness gate; typed inputs so failure ≠
absence; refusal as a typed value with a diagnostic trail; never synthesise a missing constraint).

**Three independent subsystems have now converged on the same discipline.** That is strong enough to
lift out of the individual rule packs into the shared contract rather than reimplement per country.

### G-5 — §34's Coverage Map is the most under-rated item in the whole corpus

*"Madrid 95% — but where?"* A spatial 🟢/🟡/🔴 compiled-coverage layer turns an aggregate score into an
engineering work-list, and it is the direct antidote to the four mutually-inconsistent completeness
scales the Madrid batches produced (C-2, C-10). It also complements C63 rather than competing with it:
C63 scores a city on 7 axes; the Coverage Map shows *where inside the city* the score comes from.

Cheap to build once any rule pack exists, and it would have caught the Barcelona **L-616** class of
error visually — a region rendering "fully compiled" where the FAR ceiling was in fact being ignored.

### G-6 — Where this document should ultimately live

This is contract-shaped, not findings-shaped. Its natural destinations, once ratified:

- **§26/§27 primitives + taxonomy** → a new ADR (the Genome is a decision, not a discovery), cross-referenced from ADR-0279
- **§32 conflict engine + §30/§31 provenance graphs** → the planning-regime resolver / spatial knowledge graph work, which already covers instrument-priority resolution — **reconcile, do not duplicate** (see C-22 in the Madrid ontology capture)
- **§37 national completeness metrics** → C63, which already ratifies 7 weighted axes; §37 proposes a different (finer) decomposition and the two must be reconciled rather than run in parallel
- **§34 Coverage Map** → its own tool, alongside `tools/city-completion/`

Left in `findings/` for now because it is captured founder input, not yet a ratified decision.
**Nothing here should be built until §26/§27 are checked against the existing planning-regime
resolver** — the overlap is substantial and building twice is the specific failure this whole
architecture exists to prevent.
