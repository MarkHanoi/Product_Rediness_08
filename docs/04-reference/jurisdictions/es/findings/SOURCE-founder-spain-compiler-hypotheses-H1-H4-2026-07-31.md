# SOURCE — Founder: Madrid as Training Dataset + Falsifiable Hypotheses H1–H4 (raw capture)

> **Provenance.** Founder-provided research, delivered 2026-07-31 (final message of a 16-batch
> delivery). Captured **verbatim** in §A. §B is mine and is marked as such.
>
> **This is the most important capture in the Spanish corpus** — not because it adds architecture,
> but because it makes the architecture **falsifiable**. §A's H1–H4 are the first testable claims in
> sixteen batches, with sample sizes and pass thresholds stated in advance.
>
> Country-level siblings: [`…-spanish-planning-genome`](./SOURCE-founder-spanish-planning-genome-2026-07-31.md) (phases 26–40) ·
> [`…-national-planning-compiler`](./SOURCE-founder-spain-national-planning-compiler-2026-07-31.md) (phases 41–50).
> The national-platform executive summary in the same delivery duplicates the latter and is not re-captured.

**The reframing, quoted:**

> The strongest way to think about this is to stop thinking of Madrid as a city and start thinking of
> it as a **training dataset for a compiler.**
>
> When people build a scraper, they ask: *"Can I scrape Madrid?"*
> When people build a compiler, they ask: **"What did Madrid teach me about the language spoken by
> Spanish planning systems?"**
>
> Those are completely different goals.

---

## §A — Verbatim

### Spain has far less entropy than Germany

**Germany:**

```
Berlin → BauNVO → Bebauungsplan → thousands of local plans
```

> Every municipality publishes plans differently. Sometimes XPlanung. Sometimes PDFs. Sometimes raster
> scans. Sometimes DXF. Sometimes GML. Sometimes **no GIS at all.** The entropy is enormous.

**Spain:**

```
National planning legislation → Autonomous Community legislation
  → PGOU / PGOUM / POUM → Normas Urbanísticas → GIS
```

> That hierarchy is **surprisingly consistent.**
>
> Your compiler is NOT learning Madrid. It is learning **Spanish planning language.**
> Madrid is merely one dialect.

### The seven discoveries Madrid already produced

**D1 — Planning is GIS-first, not PDF-first.**

> You originally assumed `PDF → find zone → extract rules`. **Madrid proved the reverse:**
> `GIS → identify zone → only then open legal text`. That reduces complexity enormously. Instead of
> parsing 600 pages every time, you parse Zone 4, or Zone 8, or Zone 1.3. **That is probably true
> everywhere.**

**D2 — The ontology is fixed.** *Norma Zonal, grado, uso, altura, ocupación, retranqueo, alineación*
**are not Madrid concepts. They are Spanish planning concepts.** The ontology (`Maximum Height`,
`Maximum Floors`, `Coverage`, `FAR`, `Front/Rear/Side Setback`, `Alignment Rule`, `Buildable Depth`,
`Permitted Uses`) **probably survives almost unchanged across Spain.**

**D3 — GIS layers are semantic.** *Normas Zonales · Condiciones Edificación · Ordenación · Usos ·
Gestión* are **not arbitrary — they're planning concepts.** So discovery becomes
`Search ArcGIS → Enumerate layers → Semantic classifier → Confidence score`, **rather than looking
for exact names.**

**D4 — The law repeats itself. "This is actually huge."** *La altura máxima será…* · *Número máximo
de plantas…* · *La ocupación…* · *Retranqueo…* · *Edificabilidad…*

> Those are almost templates. Meaning extraction becomes **NLP on repeated legal phrases, not general
> language understanding.**

**D5 — Article references are deterministic.** Every parameter resolves to
`Document → Title → Chapter → Article → Paragraph`. *"That's compiler-friendly. It isn't search
vaguely. It's parameter → citation."*

**D6 — Zones are finite.** Madrid has roughly Zones 1, 3, 4, 5, 7, 8, 9. *"That's not hundreds.
It's a vocabulary. Once extracted, it's done."*

**D7 — Most values are tables. "Probably the single most important research question."**

> If `70% of rules → tables`, then legal compilation becomes much easier, because **table extraction
> accuracy is dramatically higher than free-text extraction.**
> **One of the first things I would measure across cities is exactly this ratio.**

### `SpainCompiler`, not `MadridProvider` — the nine modules

| # | Module | In → Out |
| - | ------ | -------- |
| 1 | GIS Discovery | municipality → planning services |
| 2 | Layer Classification | layer metadata → Zoning / Alignment / Building conditions / Uses / Protected buildings / Management |
| 3 | Field Classification | fields → `zoneCode`, `officialDesignation`, `height`, `coverage`, `depth`… **with scoring**: `ALTURA 0.99`, `H_MAX 0.95`, `ALTMAX 0.93` |
| 4 | Legal Document Discovery | municipal portal → PGOU, Compendio, Normas Urbanísticas, Modificaciones, Texto Refundido |
| 5 | Legal Structure Parser | PDF → chapters → articles → paragraphs → tables. **Reusable nationwide** |
| 6 | Parameter Extraction | *"La altura máxima será de veinte metros."* → `{ "parameter":"maxHeight", "value":20, "unit":"m" }` |
| 7 | Citation Engine | every parameter gets `{document, article, paragraph}`. **No parameter exists without provenance** |
| 8 | Ontology Mapper | *Altura cornisa* / *Altura máxima* → `MaximumHeight` |
| 9 | Rule Compiler | → `{zoneCode, officialDesignation, maxHeight, coverage, depth, floors, uses, citations}` |

> Then Madrid becomes merely `SpainCompiler → Madrid Adapter`, instead of a Madrid-specific parser.

### How to scientifically prove scalability

> If I were writing a paper or defending this architecture, I would define **measurable hypotheses**
> rather than broad claims.

#### H1 — GIS Convergence

> *Most Spanish municipalities publish planning GIS that can be normalized into a common ontology.*

**Test:** sample **20 municipalities** of different sizes and autonomous communities.
**Measure:** ArcGIS/OGC availability (%) · machine-readable zoning (%) · machine-readable planning
polygons (%) · machine-readable uses (%).
**Threshold: if 16 of 20 succeed, H1 is strongly supported.**

#### H2 — Legal Convergence

> *Most municipal ordinances express the same planning parameters using a limited vocabulary and
> recurring document structure.*

**Test:** extract all headings from **20 ordinances**, cluster them.
**Threshold:** if *Altura*, *Ocupación*, *Edificabilidad*, *Retranqueos*, *Usos* appear consistently,
the compiler can rely on **semantic** rather than city-specific parsing.

#### H3 — Parser Reuse

> *The compiler requires progressively less city-specific code.*

**Measure per municipality:** new parser code (LOC) · existing reusable code (LOC) · new ontology
terms · new extraction rules.
**Threshold: a reuse ratio above ~85–90% after several cities would be compelling evidence.**

#### H4 — Deterministic Compilation

**Record for every compiled rule:** source document · article · paragraph · confidence ·
**whether extracted from text or table**.

**Target:**
* **100% citation coverage**
* **0 inferred numeric values**
* **Unknown rather than guessed where the ordinance is silent**

> This is a stronger claim than "high accuracy"; **it's about verifiability.**

### The end state

```
Official GIS → Semantic layer discovery → Planning ontology
                    ├── Official legal text
                    └── GIS attributes
              → Parameter extraction → Article-level citation binding
              → Normalized planning rule model → Parcel-specific buildability engine
```

> Madrid is the proof of concept because the GIS side is exceptionally rich. The next few Spanish
> cities determine whether the compiler generalizes. **If Valencia, Sevilla, Zaragoza, Bilbao, Málaga,
> and Murcia can all be implemented with largely the same pipeline, then you're not building city
> integrations — you've built a reusable national planning compilation framework.**

---

## §B — Capture notes (MINE, not the founder's)

### G-12 — H1–H4 are the first falsifiable claims in sixteen batches. Treat them as the deliverable.

Everything before this was architecture: internally coherent, largely unverifiable, and increasingly
ambitious. H1–H4 change that. They state a **sample size (20)**, a **pass threshold (16/20)**, a
**reuse ratio (85–90%)**, and — in H4 — three absolute targets that are pass/fail rather than
graded (100% citation coverage, 0 inferred values, unknown-not-guessed).

**Recommendation: adopt H1–H4 as the gate on the whole Spanish Genome programme.** The corpus has
proposed ~50 phases; none should be built past a first-cut discovery engine until H1 and H2 return a
number. Both are measurement exercises against public endpoints and public PDFs — days, not weeks,
and neither requires the compiler to exist.

### G-13 — D7 is the highest-value unanswered question in the corpus, and it is cheap

*"Most values are tables"* is flagged by the founder as *"probably the single most important research
question"*, and I agree — more than that, it is the one question whose answer **changes what to build**:

- If ~70% of Madrid's NNUU parameters live in tables, the priority is a **table extractor**
  (currently scored **0%** capability, see the national-compiler capture) and free-text NLP is secondary.
- If they live in prose, the German born-digital text path — which **shipped this session** —
  transfers far more directly, and table work is a minor add-on.

**This is answerable by opening the Compendio PDF and counting.** It requires no engine, no ontology,
and no agent fleet. It should precede any extraction work, and it pairs naturally with resolving the
Compendio version conflict (three candidate dates, C-6/C-16) since both need the actual document in hand.

### G-14 — The Spain-vs-Germany entropy claim is now partly checkable against our own shipped code

D0's argument — Germany is high-entropy (XPlanung / PDF / scans / DXF / GML / no GIS), Spain is
low-entropy (a consistent national → autonomous-community → PGOU → NNUU → GIS hierarchy) — is
plausible and matters, because it is the reason to expect Spain to scale better than Germany did.

We now have **direct evidence from the German side landed this session**: the ordinance-extraction
work reports that the text-vs-scan mix rate across ~7,000 Berlin plans is **unsampled**, that PDF
acquisition does not exist, and that **zone attribution is the blocking gap** — conflicts are detected
but never resolved, because a document-level read cannot tell which *Baugebiet* a value belongs to.

That last point is a **direct, favourable test of D1**. Germany's blocker is precisely the one D1 says
Spain does not have: Madrid's GIS answers "which zone applies" *before* the legal text is opened, so a
Spanish extractor would be scoped to one zone's chapter rather than reading a whole document and
guessing attribution. **If that holds, it is the strongest single argument in the corpus** — and it is
corroborated by our own code rather than asserted.

Worth stating the caveat: Berlin's document is a per-plan *bplan*, Madrid's is a consolidated
city-wide ordinance with an article hierarchy. The comparison favours Spain on attribution but the
document shapes differ, so this is evidence, not proof.

### G-15 — H4 is already PRYZM policy under other names

*100% citation coverage · 0 inferred numeric values · unknown rather than guessed* restates rules this
repo has arrived at repeatedly and painfully:

- **L-616** — unknown setback drawn as zero, FAR ceiling ignored (~5× over)
- **L-422/457/467/469** — failure and emptiness as the same value
- The Denmark placement resolver's four invariants, shipped this session
- The German extractor's three-valued `resolved` / `conflicted` / `unknown` output, also shipped this
  session, which explicitly refuses to pick a value when a document states two — *"picking first/max/
  modal would be the confident-wrong answer"*

**Five independent arrivals at the same discipline.** This is now beyond convergence — it should be
lifted into the shared contract as a named, CI-checkable invariant rather than re-derived per
jurisdiction. That is a concrete, small piece of work with compounding value, and unlike most of this
corpus it does not depend on any hypothesis being true.

### G-16 — What I have NOT done, and what remains the founder's call

Captured, not acted on. Specifically **not** done:

- No ADR raised for the Genome (§26/§27 are decisions, not discoveries — they need one)
- No reconciliation against the existing **planning-regime resolver / spatial knowledge graph**, which
  substantially overlaps §32/§B-Layer-2 (flagged as C-22; still the top pre-build risk)
- No C63 amendment, though §37 and H1–H4 both propose completeness decompositions that compete with
  its ratified seven axes
- No code. Nothing in sixteen batches has been implemented, and nothing should be until H1/H2/D7 return numbers

**The sequencing decision remains open and unmade** (C-25, C-31, G-11). My standing recommendation is
unchanged and now better supported: **run the cheap empirical items first** — València's P4.5 recon
via a first-cut discovery engine (which is also H1's test), the D7 table-ratio count, and the
Compendio version resolution. All three are days of work, all three are prerequisites for decisions
already queued, and all three produce artefacts that are useful regardless of which architecture wins.
