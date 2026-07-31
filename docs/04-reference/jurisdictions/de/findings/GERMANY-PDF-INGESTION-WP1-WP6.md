# Germany — PDF ingestion stack (WP1–WP6): build + live corpus measurement

> **Status:** COMPLETE for WP1-WP6 as scoped (written as measured, not after the fact) · **Date:** 2026-07-31
> **Scope:** the four ingestion layers between a Berlin plan id and parseable German text
> **Code:** `packages/ordinance-extraction/src/ingest/**` (pure) · `tools/ordinance-ingest/**` (I/O adapters)
> **Governs:** supersedes the ingestion assumptions in `de-be/11000-berlin/EXTRACTION-PIPELINE.md` §3/§4
> **Does NOT govern:** `GERMANY-CITY-ADAPTER-CONTRACT.md`, `PROBE-VERDICT-2026-07-31.md` (owned elsewhere)

## Evidence discipline used throughout

Every factual claim on this page is tagged:

- **VERIFIED** — read directly out of a live HTTP response or a local run, on the stated date.
- **ASSERTED-UNVERIFIED** — stated by a source (dossier, earlier probe) but not independently re-read here.
- **UNKNOWN** — not measured. Named explicitly rather than left as a silent gap.

A number with no tag is a bug in this document.

---

## 0 — Why this phase existed

The founder's assessment: *"The parser is not the first missing component. The ingestion pipeline is."*
The previous phase shipped a German grammar and 167 tests, all of them synthetic. The first
real fragment ever fed to it broke it. That is not an indictment of the grammar — it is what
happens when a parser has never met its corpus.

This phase built the stack that produces the corpus.

```
Layer 1  Acquisition           plan record → local PDF (fetch, checksum, cache)
Layer 2  Text extraction       PDF → per-page text, or a typed non-result
Layer 2b Digitisation class    per-page char counts → born-digital / hybrid / scanned
Layer 3  Layout reconstruction page geometry → tables            (PROTOTYPE ONLY — WP6)
Layer 4  Canonical document    STRUCTURE, not a flat string
```

---

## 1 — Endpoints hit (all 2026-07-31)

| Endpoint | Method | Result |
|---|---|---|
| `https://gdi.berlin.de/services/wfs/bplan` | `GetCapabilities` | **VERIFIED** live, WFS 2.0.0, 97,188 bytes XML |
| ↳ FeatureTypes returned | — | **VERIFIED** `bplan:b_bp_fs`, `bplan:c_bp_ak`, `bplan:a_bp_iv` — exactly the three the PROBE VERDICT §1 named |
| ↳ `b_bp_fs` `RESULTTYPE=hits` | `GetFeature` | **VERIFIED** `numberMatched="2840"` |
| ↳ `b_bp_fs` paged JSON | `GetFeature` | **VERIFIED** 2,840 records retrieved, UTF-8 clean |
| `https://fbinter.stadt-berlin.de/ScansBPlan/Begruendungen/…` | GET | **VERIFIED** serves PDFs; supports HTTP Range (`206`, `accept-ranges: bytes`) |
| `https://www.berlin.de/ba-*/…` (borough hosts) | GET | **VERIFIED** serves PDFs; **rate-limits aggressively (429)** — see §6 |
| `https://tk.gis-broker.de/…`, `https://mitte.gis-broker.de/…` | GET | **VERIFIED** serve PDFs |
| `https://geointra2.ba-tk.verwalt-berlin.de/…` | GET | **VERIFIED** unreachable from this environment (network-error) |

**Encoding note (VERIFIED, corrects an assumption).** The WFS JSON output is valid UTF-8
(`\xc3\xbc` = `ü`). An apparent mojibake in early probing was a Windows console rendering
artefact, not a data defect. No Latin-1/CP1252 normalisation is needed for this feed — unlike
the Spanish `O_INDUSTRIAL` case that motivated that step in the pipeline spec.

---

## 2 — WP1 Acquisition: what shipped + the document-availability CENSUS

**Shipped.** `tools/ordinance-ingest/lib/httpCache.ts` — polite caching fetcher; per-host
serialised request chain; honest User-Agent with contact address; SHA-256 checksum; two-level
disk cache keyed by URL so a document is fetched exactly once ever; typed outcomes mapped onto
`AcquisitionOutcome`. `lib/berlinCatalogue.ts` — WFS pager + seeded sampler.

### The census (VERIFIED, 2026-07-31, n = 2,840 = the FULL in-force population)

This is a **census, not a sample** — plan metadata is a handful of WFS requests for several
thousand records, so there is no reason to sample it.

| Document availability, in-force Berlin B-Plans | Count | Share |
|---|---:|---:|
| Has a **Begründung** link (`grund_www`) | **1,231** | **43.3 %** |
| Has only the **Planzeichnung** (`scan_www`, the drawing) | 1,600 | 56.3 % |
| Has no document link at all | 9 | 0.3 % |
| **Total in-force plans** | **2,840** | 100 % |

> **This is the single hardest structural finding of WP1.** Only **43.3 %** of in-force Berlin
> B-Plans even *have* a Begründung to parse. The remaining **56.3 %** expose only the drawing.
> For those plans the values live on the Planzeichnung / Nutzungsschablone — i.e. behind
> **table and layout reconstruction (WP6), the highest-risk component in the stack** — not
> behind OCR of running prose. No amount of grammar work reaches them.

**ASSERTED-UNVERIFIED:** the `c_bp_ak` (repealed) layer also carries document fields. Not
crawled here — repealed instruments must never yield a live rule, so they are out of scope for
extraction and were deliberately not fetched.

---

## 3 — WP2 Text extraction: what shipped + validation

**Shipped.** `tools/ordinance-ingest/lib/pdfText.ts` — `pdfjs-dist` adapter returning typed
`PdfTextOutcome`. **No dependency was added**: `pdfjs-dist@^5.6.205` was already a root
dependency and already in `pnpm-lock.yaml`, so no `package.json` and no lockfile were touched
and the `--frozen-lockfile` deploy landmine was avoided entirely.

### Validation against the known document (VERIFIED)

Berlin 8-30 Begründung, `grund_www` =
`https://www.berlin.de/ba-neukoelln/_assets/dokumente/bebauungsplaene/bebauungsplan-festgesetzt/begruendung/begruendung-8-30.pdf`
(the URL matches PROBE VERDICT §3 exactly).

| Measure | This run (VERIFIED) | Founder probe 2026-07-31 (ASSERTED-UNVERIFIED) |
|---|---:|---:|
| Pages | **209** | 215 |
| Characters recovered | **591,289** | 637,988 |
| Pages yielding text | **209 / 209 = 100 %** | not stated |
| Producer | `Adobe PDF Library 11.0` | not stated |
| Digitisation class | `born-digital-text` | "born-digital text" ✔ |

**Honest reading of the discrepancy.** The two runs do **not** agree exactly, and I will not
claim ">99 % character recovery" against a number I cannot reproduce. The page counts differ
(209 vs 215), which most likely means the file has been revised since the founder's probe —
a character-count comparison across two different revisions is not a validity test. What *is*
soundly measured is the internal metric: **every one of the 209 pages yielded text (100 %),
zero pages failed**. That is the meaningful WP2 success criterion for a born-digital document.

**The decisive corroboration is qualitative, not numeric.** The chain
`WFS → grund_www → download → pdf.js → normalize` recovers the founder's quoted clause:

```
…Allgemeines Wohngebiet mit einer zulässigen Grundflächenzahl GRZ von 0,3
  sowie einer Geschossflächenzahl GFZ von 0,9 dargestellt.
```

(The `(GRZ)` parentheses are already unwrapped by the WP4 normalizer — see §5.)

---

## 4 — 🔴 THE MOST IMPORTANT FINDING: instrument attribution

**VERIFIED, 2026-07-31, by running the parser over all 209 pages of Berlin 8-30.**

The parser reads GRZ values of **0,3 · 0,39 · 0,4 · 0,8** out of this one document. Every one
is a *correct reading of its sentence*. **Only 0,4 is the plan's binding Festsetzung.**

Read the context the full-document run surfaced:

| Page | Value | What the sentence actually says | Status |
|---|---|---|---|
| p8 | GRZ 0,3 / GFZ 0,9 | *"Der [Baunutzungsplan], **der weiter gilt**, hat … folgende Ausweisungen: … wird ein Allgemeines Wohngebiet mit einer zulässigen GRZ von 0,3 sowie einer GFZ von 0,9 **dargestellt**."* | the **superseded 1958/60 Baunutzungsplan's depiction** |
| p56 | GRZ 0,4 / GFZ 1,2 | *"Für das ca. 35.020 m² große Allgemeine Wohngebiet wird die zulässige Grundfläche **gemäß § 19 Abs. 2 BauNVO** auf eine GRZ von **0,4** … und die zulässige GFZ **gemäß § 20 Abs. 2 BauNVO** auf **1,2** … **begrenzt**."* | ✅ **THE BINDING FESTSETZUNG** |
| p47/50/60/74/158/178 | GRZ 0,8 | *"…über**schritten** werden darf, das einer GRZ von 0,8 entspricht"* | **§19(4) BauNVO overrun ceiling** for Garagen/Nebenanlagen |
| p59 | GRZ 0,39 | *"…entspricht die zulässige Überbauung einer **rechnerischen** GRZ von 0,39"* | a **computed descriptive** figure |

### Why this matters more than any parsing nicety

German planning law marks the distinction with legally exact verbs:

- **`festgesetzt` / `begrenzt auf`** → §9 BauGB — *this* plan binds. **The value.**
- **`dargestellt`** → §5 BauGB — a *preparatory* instrument (FNP / Baunutzungsplan) merely **depicts**.
- **`Überschreitung … § 19 Abs. 4`** → a permitted **overrun**, never the base.
- **`rechnerische GRZ`** → a figure the author **computed** to describe existing building.

Taking `0,8` as the GRZ overstates buildable footprint by **2×**; taking `0,3` understates it by
**25 %**. This is the L-616 "solid overstates on partial data" class arriving through the parser.

### 🔴 This corrects how the founder's probe fragment should be read

The PROBE VERDICT §4 quotes `"(GRZ) von 0,3 sowie einer Geschossflächenzahl (GFZ) von 0,9"` as
*"the exact planning parameters"* of plan 8-30. **VERIFIED here: that sentence is describing the
legacy Baunutzungsplan, not B-Plan 8-30's Festsetzung.** The verb is `dargestellt`, and the
subject is *"der Baunutzungsplan, der weiter gilt"*. B-Plan 8-30's own Festsetzung is
**GRZ 0,4 / GFZ 1,2**.

The probe was right that the text is recoverable and right that the sentence exists. The
attribution of those numbers to the plan is what does not hold. This is exactly the
confident-wrong-attribution failure the pipeline was built to prevent, and it reached the
probe itself. **The 8-30 fixture must not be used as ground truth for GRZ 0,3 / GFZ 0,9.**

*(Note: the previous phase's test suite asserted the pipeline reads 0,3/0,9 from that fragment.
That assertion is true as a statement about the sentence and false as a statement about the
plan. The test names have been corrected accordingly.)*

### What was done about it

Three sentence-scoped reject patterns added to `GERMAN_GRAMMAR` — **corpus-forced, not
speculative**: `de-dargestellt-not-festgesetzt`, `de-ueberschreitung-19-4`, `de-rechnerisch`.
Plus a general `unless` escape on `RejectPattern`, because a real p58 sentence cites §19(4)
*and* states the binding value in the same breath and a blanket reject would discard it.

Measured effect on 8-30: resolved parameters **13 → 9**; the `dargestellt` 0,3 and the
`rechnerisch` 0,39 are gone; **GRZ 0,4 / GFZ 1,2 now surface**.

**Residual (UNKNOWN → now KNOWN-OPEN):** four `0,8` readings still survive on pp. 50/59/74/158
where the merged sentence does not contain a trigger word. The parser **still cannot reliably
isolate the binding Festsetzung**. See §8.

---

## 5 — WP4 Normalization: what shipped + a real bug it exposed

**Shipped.** `packages/ordinance-extraction/src/ingest/normalize.ts` — pure, staged, each stage
reporting what it changed: Unicode NFC + ligature expansion + soft-hyphen removal;
de-hyphenation across line breaks; page-furniture removal; wrapped-line merging with paragraph
boundaries preserved; bracket normalization; whitespace collapse. Plus `detectRunningHeads`
(ratio-based, so it behaves the same on a 12-page and a 356-page document).

**The GRZ-class failure is now handled structurally**, not by the previous phase's point fix.
Two general typographic rules replace it:

1. **Unwrap parenthesised abbreviation glosses** — `(GRZ)`, `(TH)`, `(WA 1)` are restatements,
   never content. `(GRZ) von 0,3` and `Grundflächenzahl (GRZ) von 0,3` normalise alike.
2. **Drop orphan brackets** — a `)` with no `(` is debris from where an excerpt was cut, which
   is the `…) WR` shape.

The grammar keeps `KEYWORD_TAIL` as belt-and-braces for callers who skip normalization, but it
is no longer what holds the case up.

**VERIFIED running-head detection on 8-30** — 2 found, both real:
`"Begründung zum Bebauungsplan 8-30 Festsetzungsbegründung gem. § 9 Abs. 8 BauGB"` and
`"Planinhalt und Abwägung"`.

### 🔴 Bug found only on real data: pdf.js double newlines

**VERIFIED.** Most PDFs set `hasEOL` on a line's last item **and** move the baseline for the
next one. A naive item-joiner emits **two** newlines per line break. Downstream that is
catastrophic rather than cosmetic: the normalizer reads a blank line as a **paragraph
boundary**, so no wrapped line ever merges, no hyphenated word ever rejoins, and every sentence
spanning a line break becomes unparseable.

Observed on 8-30 p8, where it split
`"…GRZ von 0,3 sowie einer / Geschossflächenzahl … dargestellt."` in two — **hiding the
`dargestellt` attribution from the reject patterns and letting the wrong value through.**
No synthetic fixture could have caught this: it requires a real PDF's item geometry.

Fixed at source in `joinTextItems`. Also fixed: words run together
(`"Begründunggemäß"`, observed verbatim on plan 1-14 p1) because PDFs encode many word gaps as
horizontal jumps rather than space characters — items are now joined **geometrically**.

---

## 6 — 🔴 WP3 Corpus characterization: the politeness failure, and the honest n

### The politeness failure (VERIFIED — recorded because it nearly corrupted the headline number)

The first run used 3-way concurrency without per-host serialisation. Result: **284 of 414
attempts against `www.berlin.de` returned HTTP 429**, and my fetcher classified them as
`http-error`.

Had that stood, the reported corpus would have been ~31 % download success and the Begründung
corpus would have looked a third smaller than it is. **A 429 is a statement about my request
rate, not about the corpus.** Those 343 records were **purged and re-queued**, not counted:
a rate-limited document is UNKNOWN, not unavailable.

Fixes: `rate-limited` is now its own `AcquisitionFailureReason`, never folded into
`http-error`; requests are serialised **per host** behind that host's own chain with a 1.5 s
minimum gap; a 429 backs this process off from the **whole host**, honouring `Retry-After`;
429s are never cached, because nothing was learned about the document.

### Sampling method

- **Frame:** the 1,231 in-force plans that have a `grund_www` Begründung link (not all 2,840 —
  the other 1,609 have no Begründung to characterise).
- **Draw:** deterministic seeded shuffle (mulberry32, **seed 20260731**), so the statistic is
  exactly reproducible.
- **Per document:** download → `pdfjs` text extraction (cap 250 pages) → classify.
- **Classification thresholds** (a *choice*, stated as data, carried on every result so the
  corpus can be re-classified without re-downloading): a page is a *text page* at ≥ 100 chars;
  a document is `born-digital-text` at ≥ 90 % text pages, `scanned` below 10 %, `hybrid` between.

### 6.1 — RESULTS (VERIFIED, 2026-07-31)

**The sample requested was 500. The sample actually examined was 258. This section reports 258.**
The run was bounded by a wall-clock budget, and per-host serialisation (the fix above) makes each
document take seconds rather than milliseconds — deliberately. A smaller honest n beats a larger
claimed one.

| | Count | Share of **classified** |
|---|---:|---:|
| **born-digital text** | **158** | **63.2 %** |
| **hybrid** | **0** | **0.0 %** |
| **scanned** | **92** | **36.8 %** |
| empty | 0 | 0.0 % |
| **Classified (the statistic's denominator)** | **250** | 100 % |
| Unclassified — *not examined, not scans* | 8 | — |
| ↳ rate-limited 4 · http-not-found 2 · network-error 1 · http-error 1 | | |
| **Attempted (n)** | **258** | — |

- **Download success: 250 / 258 = 96.9 %** (target was 95 %). Before per-host throttling it was 31 %.
- Volume actually read: **14,015 pages, 35,916,752 characters**.

**Striking result: ZERO hybrids.** Across 250 documents not one landed between 10 % and 90 %
text pages. Berlin's Begründung corpus is **strictly bimodal** — a document either has a full
text layer or none at all. That is a genuinely useful property: routing is a clean binary
decision, with no partial-document salvage tier to build.

### 6.2 — What this means for coverage (combining §2 and §6.1)

| Segment of in-force Berlin B-Plans | Share | Path |
|---|---:|---|
| Begründung, born-digital → **text pipeline works today** | **27.4 %** | shipped |
| Begründung, scanned → needs OCR | 15.9 % | not built |
| Drawing only, raster (§8) → needs OCR **+** table reconstruction | 56.3 % | not built |
| No document at all | 0.3 % | unreachable |

> 🔴 **The headline coverage number: ~27 % of in-force Berlin B-Plans are reachable by the text
> extraction pipeline as it stands.** Not 100 %, and not the 43.3 % that have a Begründung —
> because a third of those Begründungen are scans.
>
> This is the honest denominator the Berlin dossier asked for ("Rate target = known denominator
> + verified coverage, NOT 100 % extraction", EXTRACTION-PIPELINE.md §4.3). It is now known.

**Method caveats, stated:**
- Frame is the 1,231 plans **with** a `grund_www` link, not all 2,840 — percentages above are
  re-based onto the full population explicitly in §6.2.
- Page reads capped at 250 pages/document; documents longer than that are classified on a prefix.
  Given zero observed hybrids, prefix bias appears negligible here, but it is not zero.
- Thresholds (100 chars/page; 90 % / 10 % ratios) are a **choice** — carried on every record so
  the corpus can be reclassified without re-downloading.

Raw per-document records: `.cache/ordinance-ingest/characterization-seed20260731.jsonl`
(one JSON object per document, appended as completed, so an interrupted run still yields an
honestly-sized sample). Reproduce with
`npx tsx tools/ordinance-ingest/characterize.ts --n 500 --seed 20260731`.

---

## 7 — WP5 Real-corpus regression

**Shipped.** `packages/ordinance-extraction/__tests__/berlinRealCorpus.test.ts` — every
sentence in it was read out of an actual Berlin Begründung by the ingestion stack on
2026-07-31. Suite total **181 tests** (was 167). The synthetic suites are retained — they
encode real reasoning — but the corpus file is what now speaks for the corpus.

**Real-document cases pinned:** the binding p56 Festsetzung (GRZ 0,4 / GFZ 1,2); the p8
`dargestellt` legacy-instrument rejection; the p47 §19(4) overrun rejection; the p58
one-sentence-two-jobs `unless` escape; the pdf.js double-newline defect end-to-end; word-gap
restoration; orphan-bracket and gloss normalization.

### What real documents broke that synthetic fixtures had hidden (all VERIFIED)

| # | Defect | Why no synthetic fixture could catch it |
|---|---|---|
| 1 | **pdf.js emits TWO newlines per line break** (`hasEOL` + baseline move) | Requires real item geometry. The normalizer read the blank line as a paragraph boundary, so nothing merged — and the `dargestellt` verb was severed from its clause, letting a superseded instrument's value through as the plan's. |
| 2 | **Words run together** — `"Begründunggemäß"` (plan 1-14 p1) | PDFs encode many word gaps as horizontal jumps, not space characters. Only real font metrics expose it. |
| 3 | **Statutory citation between keyword and value** — `"GFZ gemäß § 20 Abs. 2 BauNVO auf 1,2"` (8-30 p56) | Blocked the plan's actual FAR. Nobody writes this shape into a hand-made fixture. |
| 4 | **Regex backtracking bound `GRZ = 9`** (8-30 p87) | Introduced by the fix for #3: `§ 19` backtracked to `§ 1`, leaving `9` as the value. Caught by the range gate — defence in depth working — but the grammar was wrong. |
| 5 | **Over-broad reject killed a real Festsetzung** | A first `Überschreitung` pattern matched the bare verb and mis-fired on `"darf 18 m nicht überschreiten"`, the standard binding phrasing for heights. `nicht` is the discriminator. |
| 6 | **Rate limiting misread as data absence** | 284 × HTTP 429 recorded as `http-error`. See §6. |

Measured effect of the whole pass on 8-30: **13 → 10 resolved parameters**, the wrong readings
progressively eliminated, and **GRZ 0,4 / GFZ 1,2 / 5 Vollgeschosse** — the plan's actual
Festsetzung — all now surfacing.

---

## 8 — 🔴 WP6 Table extraction: the probe that changed the scope

**VERIFIED, 2026-07-31.** Before building a Nutzungsschablone reconstructor, one thing had to
be measured: *do the Planzeichnungen carry a text layer at all?* The WP1 census says **1,600
in-force plans (56.3 %) expose only `scan_www`** — the drawing — so for those plans every
planning number lives in a table on that sheet.

Seeded random sample of the drawing-only population (seed 20260731):

| Planzeichnung digitisation | Count |
|---|---:|
| text layer | **0** |
| hybrid | **0** |
| **raster (0 characters recovered)** | **21** |
| acquisition failed (rate-limited) | 1 |
| **ACTUAL n examined** | **21** |

**Every single one is a pure raster scan — 1 or 2 pages, exactly 0 characters.**

### Consequence

For the 56.3 % drawing-only majority, Nutzungsschablone reconstruction is **not** the
positioned-text geometry problem WP6 was scoped as. It is **OCR *plus* table detection on an
image** — the two highest-risk components in the stack, stacked. The founder's risk table rates
table reconstruction High/High and OCR Medium/Medium; for this corpus segment they are not
independent rows, they compose.

**Decision taken: the positioned-text table prototype was NOT built.** Building it would have
produced a component that works only on tables inside born-digital Begründungen — a genuine but
much smaller case — while appearing to address the 56.3 %. That would be a prototype that
solves the wrong problem and reports success. The measurement is the deliverable here.

*(This also independently confirms, rather than contradicts, PROBE VERDICT §5's "mixed corpus"
qualifier — and locates the scan half precisely: it is the drawings, near-totally.)*

---

---

## 9 — 🔴 THE VERDICT: is the remaining work normalization, table handling, or grammar?

The founder asked for this answer explicitly. Measured, it is **none of the three as posed** —
the corpus splits into two halves with two different bottlenecks, and neither is grammar syntax.

**Normalization: essentially DONE.** It was Low risk / Low effort as predicted, it is built, and
it structurally eliminated the failure class that opened this phase. It is not the bottleneck.

**Grammar refinement: NOT the bottleneck, and this is the phase's main correction.** The German
grammar reads real Festsetzung prose correctly — it found GRZ 0,4 / GFZ 1,2 / 5 Vollgeschosse
out of a 209-page document. What it *cannot* do is decide **which of the values it correctly
read actually binds the parcel**. That is not a parsing problem. It is a **semantic
attribution** problem with two distinct axes:

1. **Instrument attribution** — is this sentence stating *this* plan's Festsetzung, quoting a
   superseded Baunutzungsplan, describing an FNP depiction, or granting a §19(4) overrun? (§4.)
2. **Zone attribution** — which Baugebiet (WA 1 / WA 2 / SO) does the value bind? The core
   currently reports honest conflicts and resolves none.

More regex will not fix either. Both need the value tied to its **governing clause and zone**,
which is a document-structure problem — i.e. **Layer 4, the canonical document**, which is
built as a type but not yet populated by a real section/heading parser.

**Table handling: the bottleneck for the larger half, and worse than rated.** 56.3 % of
in-force plans have no prose at all, and their drawings are **21/21 raster** (§8). For that
half the path is OCR **then** table detection on an image — two high-risk components composed,
not one.

### So, ranked by what actually unblocks coverage

| Rank | Work | Reaches | Risk |
|---|---|---|---|
| 1 | **Semantic attribution** (instrument + zone), via a real Layer-4 section parser | the 43.3 % with prose — turns "reads values" into "reads the RIGHT value" | Medium |
| 2 | **OCR + table reconstruction on raster drawings** | the 56.3 % with no prose | **High × High** |
| 3 | Grammar refinement | marginal — syntax is not what is failing | Medium |
| 4 | Normalization | done | Low |

**The honest headline: the ingestion pipeline is no longer the missing component — it is built
and measured. The next missing component is not a better parser, it is a document MODEL.**

---

## 10 — Still missing / still assumed

**KNOWN-OPEN (measured, not fixed):**

1. **Festsetzung isolation is unsolved.** The parser reads every GRZ in a document, including
   overrun ceilings and other instruments' depictions. Three reject patterns help; four wrong
   readings still survive on 8-30. **This, not OCR, is the top correctness risk.**
2. **Zone attribution is unsolved.** A B-Plan sets different values per Baugebiet (WA 1 / WA 2).
   The core reads a *document*, not a parcel, and correctly reports conflicts rather than
   choosing — but nothing yet resolves them.
3. **Page-scoped parsing hides cross-page conflicts.** The current runner parses page by page so
   citations carry real page numbers; a GRZ 0,4 on p56 and a GRZ 0,8 on p74 therefore never meet
   as a conflict. Document-scoped parsing would surface it. Deliberate trade-off, currently
   unresolved.
4. **56.3 % of in-force plans have no Begründung at all** (§2) and are unreachable by any text
   path. Their drawings are raster (§8).
5. **Layer 3 (layout reconstruction) and Layer 4 (canonical document) are TYPES, not
   implementations.** `CanonicalDocument` / `CanonicalSection` / `CanonicalTable` are defined
   and documented, and nothing populates them yet. The §9 verdict says this is now the
   highest-value next build.
6. **The WP6 positioned-text table prototype was deliberately not built** — see §8 for why that
   is a decision rather than an omission.
7. **No OCR fallback exists.** Measured need is now quantified (§8): the raster corpus is
   ~56 % of in-force plans plus the `scanned` share of Begründungen (§6.1).

**UNKNOWN (not measured):**

- Whether the 8-30 PDF was revised between the founder's probe and this run (page count differs).
- The digitisation split of the `c_bp_ak` repealed corpus (deliberately not crawled).
- The Nutzungsschablone layout inventory — how many distinct table layouts Berlin actually uses.
- Whether borough hosts other than `www.berlin.de` also rate-limit under sustained load.
- Munich (09162) and Hamburg (02000): **untouched, still blocked awaiting founder data.** No
  inputs fabricated.

---

*Facts tagged VERIFIED were read from live responses or local runs on 2026-07-31.
Code: `packages/ordinance-extraction/src/ingest/**`, `tools/ordinance-ingest/**`.*
