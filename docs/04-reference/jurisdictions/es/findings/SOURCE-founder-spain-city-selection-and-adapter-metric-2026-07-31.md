# SOURCE — Founder: City Selection Strategy, the Adapter-Size Metric & National Compiler Families (raw capture)

> **Provenance.** Founder-provided research, delivered 2026-07-31 (17th and final batch).
> Captured **verbatim** in §A. §B is mine and is marked as such.
>
> Country-level siblings: [`…-genome`](./SOURCE-founder-spanish-planning-genome-2026-07-31.md) (26–40) ·
> [`…-national-planning-compiler`](./SOURCE-founder-spain-national-planning-compiler-2026-07-31.md) (41–50) ·
> [`…-hypotheses-H1-H4`](./SOURCE-founder-spain-compiler-hypotheses-H1-H4-2026-07-31.md).

**The selection principle, quoted:**

> I would intentionally pick cities that **stress-test different parts of the architecture**, rather
> than simply choosing the next largest municipality. The goal is to demonstrate that the compiler
> generalizes across different planning traditions, GIS implementations, and legal document structures.

---

## §A — Verbatim

### The seven-city sequence and what each teaches

| # | City | New capability | Notes |
| - | ---- | -------------- | ----- |
| 1 | **Madrid** | **GIS-first planning** | *reference implementation* — ArcGIS discovery, spatial routing, zoning ontology, GIS/legal separation, explicit envelopes (NZ1), article extraction from a large ordinance. GIS discovery ★★★★★ · Legal parser ★★★★☆ · Rule compiler ★★★★☆ |
| 2 | **Barcelona** | **hierarchical planning — "hard mode"** | *almost the opposite problem* |
| 3 | **València** | **canonical PGOU** | *"probably the ideal second implementation… much closer to the average Spanish city"* |
| 4 | **Zaragoza** | **reuse validation** | large, mature GIS, conventional ordinance |
| 5 | **Sevilla** | **regional legal variation** | tests Andalusia — different regional legislation, terminology, layout |
| 6 | **Bilbao** | **planning terminology variation** | tests whether the ontology is stronger than regional legal drafting style |
| 7 | **Málaga** | **additional GIS validation** | large, coastal, modern GIS — checks discovery beyond central Spain |

> **Notice something. Only Madrid is about *discovering* the architecture. The remaining cities are
> about *proving* that the architecture holds.**

### Barcelona — why it is hard mode

Instead of `parcel → Norma Zonal → rules`, Barcelona often gives:

```
parcel → MPGM / PEU / PMU → specific plan → rules
```

> The compiler must therefore learn **hierarchical planning**:
> `General Plan → Special Plan → Modification → Parcel`.
> That is reusable across Catalonia. Barcelona teaches **plan precedence, inherited rules, overrides,
> hierarchical citations.**

### València — the first proof of reuse

Expected `PGOU → Urban Ordinances → Zones → Articles`.

> If the Madrid parser largely works unchanged, **that's your first proof of reuse.**

| Expected NEW work | Expected REUSED |
| ----------------- | --------------- |
| new GIS field names · different zoning vocabulary · slightly different chapter numbering | article parser · ontology · citation engine · GIS discovery · compiler |

> **Reuse target: 80–90%.**

### After six cities — measure

| Component | Madrid | València | Barcelona | Bilbao |
| --------- | -----: | -------: | --------: | -----: |
| GIS Discovery | 100% | 5% | — | 3% |
| Legal Parser | 100% | 15% | 40% *(still acceptable)* | — |
| Citation Engine | 100% | **100% reused, 0% changed** | — | — |
| Ontology | — | **never changes → becomes national** | — | — |

> *"That proves the citation model is universal."*

### The adapter shape

```
Spain Compiler:  GIS Discovery · Legal Parser · Citation Engine · Ontology · Rule Compiler
       ↓
Madrid Adapter · Valencia Adapter · Barcelona Adapter · Bilbao Adapter · Sevilla Adapter · …
```

> **The adapters become tiny.** Ideally an adapter only contains:

```yaml
zoneLayer:
fieldMappings:
documentLocation:
chapterOffsets:
```

> **Everything else belongs to the compiler.**

### The real success metric

> I wouldn't say *"We support 50 Spanish cities."* I'd say:
>
> **"The median municipality requires fewer than 200 lines of city-specific configuration."**
>
> That is a much stronger engineering claim.

| | Lines |
| - | ----: |
| Compiler | 120,000 |
| Madrid adapter | 280 |
| València adapter | 170 |
| Sevilla adapter | 190 |
| Bilbao adapter | 160 |
| Barcelona adapter | 450 |

> That demonstrates **the compiler is doing the work — not bespoke integrations.**

### Beyond Spain — national compiler families

| Country | Likely reusable family |
| ------- | ---------------------- |
| Spain | PGOU / PGOUM / POUM compiler |
| Portugal | PDM / PU / PP compiler |
| France | PLU / PLUi compiler |
| Italy | PRG / PGT compiler |
| Netherlands | Omgevingsplan compiler |
| Germany | Bauleitplanung / Bebauungsplan compiler |

> The long-term vision isn't "a Madrid parser" or even "a Spanish parser." It's a **library of
> national planning compilers**, each with a shared ontology and a small amount of country-specific
> configuration.

---

## §B — Capture notes (MINE, not the founder's)

### G-17 — The <200-LOC adapter metric is the best success criterion in seventeen batches

Alongside H1–H4, this is the other genuinely **falsifiable** claim, and it is better than a coverage
percentage in three ways: it cannot be gamed by scoping down a city, it is measurable continuously
rather than at the end, and it **fails loudly** — an adapter creeping past 200 lines is visible in a
diff long before anyone writes a status report claiming reuse.

Recommend adopting it verbatim as the programme's headline metric, with the per-city figures tracked
in the same place as the C63 scores. **It also has a natural CI form**: a check that fails when any
city adapter exceeds its budget. That is cheap and would catch architectural drift automatically.

### G-18 — Barcelona is correctly identified as hard mode, and PRYZM already has the evidence

The founder places Barcelona at #2 for hierarchical planning (`MPGM / PEU / PMU`) and predicts the
worst reuse figures (Legal Parser 40% changed, adapter 450 lines — **60% larger than any other**).

That prediction is independently corroborated by what this repo already knows, and the corroboration
is worth stating because it arrived from a different direction:

- **ADR-0271** — Barcelona `edificabilitat` is a **CONSTRUCTION, not a lookup**; Art. 242.2 is an
  algorithm. A vocabulary-mapping compiler reads it as a value and is **silently wrong**.
- Barcelona is nonetheless the **only city with a complete envelope pack** today, so it is also the
  one city where the compiler's output can be checked against a shipped, working implementation.

**That combination makes Barcelona the single most valuable validation target, not merely the
hardest.** Everywhere else, a compiler error produces a plausible number nobody can refute. In
Barcelona we can measure it. I would argue for running Barcelona *earlier* than #2-after-Madrid
suggests — specifically, running the compiler against Art. 242.2 as a **known-answer test** before
trusting it anywhere else.

### G-19 — One caution on the reuse percentages

The figures (GIS Discovery: València 5%, Bilbao 3%; Legal Parser: València 15%, Barcelona 40%) are
**illustrative targets, not measurements** — no second city has been attempted. They are the *shape*
of the expected result, and the corpus reads more confidently than the evidence supports.

This matters because H3 sets a **>85–90% reuse ratio** as the pass threshold. If those illustrative
numbers are later quoted back as achieved results, H3 becomes unfalsifiable — the exact failure mode
H1–H4 were introduced to prevent. **Record them as predictions, and measure against them.**

### G-20 — The country-family table is a genuinely new strategic input, and it partly contradicts the corpus

The Spain→Portugal→France→Italy→Netherlands→Germany family table is the first time the delivery looks
past Spain, and it reframes the whole programme as *"a library of national planning compilers"*.

Two things to weigh honestly:

1. **It fits PRYZM's existing jurisdiction map.** Phase 1–3 work already covers 15 countries; this
   proposes the compiler layer that would sit underneath them.
2. **It sits awkwardly with the corpus's own Germany argument.** Batch 16 argued Spain scales *because*
   Germany is high-entropy (XPlanung/PDF/scans/DXF/GML/no-GIS). This table now lists Germany as just
   another family with a `Bauleitplanung / Bebauungsplan compiler`. Both cannot be fully true: either
   German entropy is a real structural barrier, or it is another compiler family.

Our own shipped code leans toward the first reading — the German extractor landed this session with
**zone attribution unresolved** and the text-vs-scan rate across ~7,000 Berlin plans **unsampled**.
That is exactly what high entropy looks like in practice. The table should be read as a *hypothesis
about country families*, not as a plan, and Germany's entry specifically should carry the caveat that
we have already met its blocker.

### G-21 — Delivery closed: 17 batches, 10 capture files, nothing built

This completes the 2026-07-31 founder delivery. What exists now is a complete, verbatim, cross-linked
evidence chain with every internal conflict recorded rather than silently resolved (C-1…C-31, G-1…G-21,
V-1…V-8).

**No code has been written and no architectural decision has been ratified** — deliberately. The
sequencing decision (C-25, C-31, G-11, G-16) remains open and is the founder's.

My standing recommendation, unchanged across the corpus and now supported by the founder's own
H1–H4 framing: **run the three cheap empirical items before building anything.**

1. **València P4.5 recon** via a first-cut §41 discovery engine — this *is* H1's test, and produces a
   required artefact either way (1–2 days)
2. **The D7 table-ratio count** — open the Compendio and count what fraction of parameters live in
   tables; decides whether the priority is a table extractor (0% capability today) or the German text
   path that already shipped
3. **Resolve the Compendio version** — three candidate dates (C-6/C-16); blocks every Madrid citation

All three are days of work. All three are prerequisites for decisions already queued. None of them
requires the compiler, the ontology, or the graph to exist first.
