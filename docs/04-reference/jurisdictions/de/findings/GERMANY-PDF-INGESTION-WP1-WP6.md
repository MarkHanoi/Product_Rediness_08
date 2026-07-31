# Germany — PDF ingestion stack (WP1–WP6): build + live corpus measurement

> **Status:** IN PROGRESS (written as measured, not after the fact) · **Started:** 2026-07-31
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

### Results

> ⏳ **RUN IN PROGRESS at time of writing.** Final counts and the actual n are filled in at §6.1
> below when the run completes. Interim figures are deliberately NOT reported as the headline —
> a partial sample stated as a result is how a statistic becomes a rumour.

Raw per-document records: `.cache/ordinance-ingest/characterization-seed20260731.jsonl`
(one JSON object per document, appended as completed, so an interrupted run still yields an
honestly-sized sample).

#### 6.1 — Final tally

*(pending — see above)*

---

## 7 — WP5 Real-corpus regression / WP6 Table extraction

*(in progress — filled in as measured)*

---

## 8 — Still missing / still assumed

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
   path.

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
