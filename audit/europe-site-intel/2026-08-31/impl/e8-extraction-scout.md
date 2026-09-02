# Lane E8-SCOUT — what exists, what COMPASS gives us, what the corpora actually serve

**Date:** 2026-09-01 · **Mode:** READ-ONLY (no production file changed, nothing committed) ·
**Binding:** `E4-EXECUTION-CONTROL.md` controls 2/3/5/8/9/10 · spec §20 *AI INTERPRETS, DETERMINISTIC COMPUTES*.

> **Verdict in one line.** ⭐ **Build far less than planned.** The extraction *core*, its verification
> *gates*, its *honesty locks* and the *frozen schema guard* that spec §20 exists to enforce are ALL
> already in the repo, tested green today. What does not exist is **one layer** (document → structured
> table/section) and **one producer** (something that emits `derivation: 'AI_EXTRACTED'`). Meanwhile
> **the corpora are worse than the audit recorded for DE, better than recorded for CH, and differently
> shaped than recorded for FR** — all three measured first-hand below.

---

## §0 · What was executed (every number here was measured today, nothing transcribed)

| # | Command | RC | Result |
|---|---|---|---|
| 1 | `npx vitest run --root packages/ordinance-extraction` | **0** | **20 files · 252 tests · all pass** |
| 2 | `pnpm --filter @pryzm/ordinance-extraction typecheck` | **0** | clean |
| 3 | `npx tsx tools/ga-gate/check-zoning-fidelity-label.ts` | **0** | PASS — the only gate that knows the word `pipeline-extracted-unverified` |
| 4 | `npx tsx tools/ga-gate/check-envelope-never-overstates.ts` | **0** | 6 jurisdictions · 181 zone-solves · 0 overstatements |
| 5 | `npx tsx tools/ga-gate/check-refusal-identity.ts` | **3** | ⚠ **RED, pre-existing** — 109 findings vs baseline 67, **42 unbaselined** |
| 6 | `npx tsx tools/ga-gate/check-provenance-not-invented.ts` | **3** | ⚠ **RED, pre-existing** — STALE LEDGER (line drift) + 2 unledgered V1s |
| 7 | `npx tsx tools/ga-gate/check-provenance-coverage.ts` | **0** | PASS (element kinds — not this subject) |
| 8 | `npx tsx tools/ga-gate/check-constraint-honesty.ts` | **0** | PASS (constraint solver — not this subject) |
| 9 | NRW OGC API `numberMatched` probe | 200 | **82,007** — the audit's figure CONFIRMED |
| 10 | 2 × NRW corpus sweeps (80 + 57 features, **31 documents fetched and opened**) | 0 | see §3.1 — the audit's DE reading needs restating |
| 11 | Swiss ÖREB `GetExtractById` (EGRID `CH873588275009`) | 200 | 10 restrictions, **10/10 carry `LegalProvisions`** |
| 12 | Swiss `luze_BZR.pdf` through `tools/ordinance-ingest/extract.ts` | 0 | **46 pp · 69,714 ch · 100 % text pages** |
| 13 | GPU `zone-urba` × 6 French cities | 200 | `urlfic` filled **3 / 6**, only **1 / 6** is a real per-zone address |
| 14 | Marseille PLUi règlement through the same CLI | 0 | **478 pp · 1,043,322 ch · 100 % text pages · 34.6 MB** |
| 15 | Sample-size arithmetic **with a falsification control** | 0 | reproduces COMPASS's own published ±13.83 % exactly (§4.4) |

**Falsification control (§4.4).** The sizing formula was not trusted on its own: it was first run against an
INDEPENDENT published figure — COMPASS's validation page states *"Assuming 10,000 jurisdictions, there is a
95% chance that the metrics are within ±13.83% of the reported value"* for n=50. My computation returns
**13.83 %**. A formula that could not reproduce someone else's published number would not have been allowed
to size PRYZM's trial.

**mtime discipline.** Everything inherited was date-checked. `packages/ordinance-extraction/src/attribution/`
is dated **2026-08-09**; its consumer `evaluateDeclarative.ts` was wired **2026-09-01**. That gap is not
cosmetic — see finding **F-1**.

---

## §1 · TASK 1 — what PRYZM already has

`@pryzm/ordinance-extraction` is **63 files · ~4,100 lines of `src` · 20 test files · 252 tests**, and it is
substantially more complete than "a package that exists". Read in full for this lane.

### 1.1 What it EXTRACTS today (working, executable)

| Capability | Where | State |
|---|---|---|
| **Born-digital German text-parse** | `textExtract/extractor.ts` + `grammars/german.ts` | ⭐ **REAL.** `extractRules(text, grammar, source)`: sentence segmentation, locale-correct parsing, reject-scoping, citation resolution, honest-unknown accounting, tier stamping. 13 matcher / reject / rule-reference ids. Proven on Berlin 8-30. **The core is jurisdiction-agnostic; the grammar is the only per-country surface** (control 5 satisfied by construction). |
| **PDF item → page text (geometric join)** | `ingest/pdfItems.ts` | ⭐ **REAL, and it fixes two MEASURED corpus defects** — words glued by horizontal jumps (Berlin 1-14 p1) and doubled newlines (Berlin 8-30 p8). Both carry regression tests. |
| **Digitisation classification** | `ingest/classify.ts` | ⭐ **REAL.** `born-digital-text / hybrid / scanned / empty`, with published, overridable thresholds and every raw count carried on the result, so a corpus can be reclassified without re-downloading a single PDF. |
| **Text normalization** | `ingest/normalize.ts` (371 ll.) | ⭐ **REAL.** NFC, ligatures, soft hyphens, de-hyphenation, wrapped-line merge, page furniture, bracket unwrapping — each stage reports what it changed. Deliberately never touches digits (that would re-open the 1000× locale trap). |
| **Cited rules → typed envelope parameters** | `envelope/mapper.ts` + `coherence.ts` | ⭐ **REAL, and three-valued**: `resolved` / `conflicted` / `unknown`. A conflict carries BOTH cited values and NO value — it never picks first/max/modal. |
| **Legal attribution — which correct reading BINDS** | `attribution/` (860 ll. + 3 tables) | ⭐ **REAL and now WIRED** (F-1). `resolveParameter` is a 10-stage resolver; the DE / Madrid / DK priority tables are DATA, not logic. |

**Seven verification gates exist and are unit-tested**: `supersession` (Stage 0, structurally upstream of
any fetch), `regime` (does this legal regime produce numbers at all — §34/§35 BauGB answer with a *cited
refusal*, which is a positive product answer), `dual-pass`, `arithmetic`, `range`, `locale` (the 1000× trap),
`algorithm` (the fabricated-number trap), plus whole-envelope `coherence`.

### 1.2 What it merely TYPES (declared, zero implementation)

| Declared | Where | Producers |
|---|---|---|
| **`CanonicalDocument` / `CanonicalSection` / `CanonicalTable`** — Layers 3–4, "STRUCTURE, not a flat string" | `ingest/types.ts` | **ZERO.** A grep for all three names outside their own declaration returns **nothing**. ⭐ **This is the hole.** `CanonicalTable.confident` is declared load-bearing — *"the German Nutzungsschablone is a grid whose reconstruction is the HIGHEST-risk component in the whole stack"* — and nothing computes it. |
| **`AcquisitionOutcome` / `AcquisitionFailureReason`** (8 members incl. `rate-limited`, `not-a-pdf`) | `ingest/types.ts` | Types only in the package; the adapter lives in `tools/ordinance-ingest/lib/httpCache.ts`, outside the build graph (F-6). |
| **`DualPassExtractor`** — the LLM PORT | `gates/dualPassAgreement.ts` | **ZERO implementations anywhere in the repo.** The entire `runDocumentExtraction` orchestrator therefore runs on nothing. |
| **`OrdinanceEnumerator`** | `enumerator.ts` | One STUB (`BarcelonaRpucEnumerator`, self-described as such). |

### 1.3 Four-axis reachability (the §authored-but-unwired test)

| Axis | Reading |
|---|---|
| **Import / construction** | ONE workspace dependent: `@pryzm/site-parcel-data`. **ONE production file imports it — `evaluateDeclarative.ts`** — and it imports from the `attribution/` subtree ONLY. Nothing in `packages/`, `plugins/`, `apps/` or `server` imports the pipeline, gates, grammars, ingest, envelope or textExtract. |
| **Bus verb** | **NONE.** No command, no verb, no dispatcher path reaches any part of the package. |
| **Build graph** | **IN.** Typechecks RC=0; 252 tests RC=0; `test:ci` present, so `pnpm -r run test:ci` covers it. ⚠ **`tools/ordinance-ingest/` is NOT**: no `package.json`, no npm script, no CI reference — four CLIs invoked only by hand. |
| **Call** | `resolveParameter` — **called once**, at `evaluateDeclarative.ts:623`, with `ParameterEvidence` genuinely constructed at `:602` (verified, not inferred from the import list). `extractRules` / `toEnvelopeParameters` / `classifyDigitisation` / `normalizePages` — **called only from the hand-run CLIs**. `runDocumentExtraction`, `regimeGate`, `supersessionGate`, `arithmeticCrossCheck`, `dualPassAgreement`, `algorithmGate`, `localeGate`, `rangeSanityGate`, `BarcelonaRpucEnumerator`, `GERMAN_REGIMES` — **ZERO call sites outside `__tests__/`**. |

> ⛔ **`resolveParameter` is a NAME COLLISION.** `packages/family-runtime/src/resolution/resolveParameter.ts`
> exports a function of the same name in an unrelated domain, with ~20 call sites. A repo-wide grep for
> `resolveParameter(` is **dominated by the wrong one**, and reads as if the attribution layer were heavily
> used. Anyone auditing this seam must filter by import source, not by name (§grep-silence-has-three-causes).

### 1.4 ⭐ F-1 — the attribution layer's own header is now FALSE

`attribution/index.ts` (mtime **2026-08-09**) still says:

> *"⚠ DELIBERATELY WIRED TO NOTHING. `toEnvelopeParameters` is unchanged and no producer emits
> `ParameterEvidence` yet … This layer is what a real Layer-4 section parser will feed."*

**Measured 2026-09-01:** `evaluateDeclarative.ts:602` constructs `ParameterEvidence<DeclarativeScalar>[]`
and `:623` calls `resolveParameter` on it. The E1c lane became the producer that header is waiting for.
The header is a stale claim of the L-809 family — a document describing an absence that no longer exists.
**Correction owed** (documentation only; no code change, and none needed).

### 1.5 The gate battery — measured, and the headline is an ABSENCE

`ls tools/ga-gate/` → **76 `check-*.ts`**. Greps for `extract|ordinance|attribut|overstate|tier|claim`
return four candidates; all four were run (§0 rows 3–8).

> ⛔ **There is NO gate over `packages/ordinance-extraction`.** Not one of the 76 names it, imports it, or
> asserts anything about it. `grep -l "pipeline-extracted-unverified" tools/ga-gate/*.ts` returns exactly
> **ONE file — `check-zoning-fidelity-label.ts`** — and that gate guards the **render** (arm B: every
> non-authoritative confidence tier must have its own badge branch), never the **producer**.

So the honesty invariants are enforced in exactly two places, and neither is on the extraction path:

1. **At the schema (L0, FROZEN — control 3).** `packages/schemas/src/siteintel/provenance.ts`'s
   `superRefine` already makes the spec-§20 failure **unrepresentable**:
   - `tier 1 (authoritative-machine-readable) + derivation AI_EXTRACTED` → **rejected**
   - `tier 1 + valueLocation in-document-text` → **rejected**
   - `tier 5 (human-validated) without derivation HUMAN_VALIDATED` → **rejected**
   - `value = null` only at tier 6 (uncertain-missing) — control 9 in the type system
2. **At the render.** `check-zoning-fidelity-label` RC=0.

⭐ **This is the single most budget-relevant finding of the lane.** *"An AI-extracted number reaching tier 1
unlabelled"* — the exact failure this wave exists to prevent — **is already unrepresentable, in a FROZEN
schema.** It does not need building, and under control 3 it must not be touched. The package's own
`confidence.ts` `canGraduateTier` (LOCK 3) is a second, independent statement of the same rule on the C58
ladder: nothing rises above `pipeline-extracted-unverified` without a recorded `humanVerifiedBy`.

⚠ **Two tier ladders coexist. Both are legitimate; they must not be conflated.** The **C58
`EnvelopeConfidence`** ladder used inside `ordinance-extraction` — `not-determined <
pipeline-extracted-unverified < estimated-ruleset < block-constructed < structured < authoritative`
(`ENVELOPE_CONFIDENCE_ORDER`, L0) — and the **E1a six-tier `RuleProvenance`** ladder used by the country
adapters (tier 1 authoritative-machine-readable … tier 6 uncertain-missing, orthogonal to `derivation`).
The build lane owes a stated mapping between them and **must not mint a seventh tier** (control 2).

**Producers emitting `derivation: 'AI_EXTRACTED'` today: ZERO.** The one hit,
`evaluateDeclarative.ts:242`, is a *consumer* — a `switch` arm that already knows what to do with one.
**The seat is built and empty.**

---

## §2 · TASK 2 — NREL COMPASS, verified not assumed

Fetched and read 2026-09-01. **The `e5-oss-delta.md` D31 record is accurate on licence and on the existence
of the guardrails, and understates the project's activity.** Three corrections/additions:

| Recorded claim | Verified |
|---|---|
| Repo `NREL/COMPASS` | ⚠ the canonical `full_name` is now **`NatLabRockies/COMPASS`** (`NREL/*` redirects). Same for `NREL/elm` → `NatLabRockies/elm`. Cite the live path. |
| BSD-3-Clause | ✅ **CONFIRMED at the LICENSE file** — *"BSD 3-Clause License / Copyright (c) 2025, Alliance for Sustainable Energy, LLC"*, three clauses, **no added terms**. `elm` likewise BSD-3. |
| "381 commits, 17 stars" | ✅ stars 17 · forks 4 · **56 open issues** · `pushed_at` **2026-09-01**, latest commit **2026-08-31**. ⭐ **Actively maintained as of yesterday** — not a quiet repo. |
| "extraction accuracy is not published" | ⚠ **PARTLY REFUTED.** A validation page exists (`natlabrockies.github.io/COMPASS/val/validation.html`) with **named sample sizes** (50 · 78 · 83 · 100 · 19 documents, by technology) and **explicit margins of error**. The *numbers themselves live in images*, and **ground-truth methodology, labeller identity and inter-rater reliability are absent.** So: a validation *design* is published; an auditable *result* is not. |

### 2.1 The guardrails, MECHANICALLY (this is the part worth having)

Four distinct guards, in increasing cost — in `compass/extraction/apply.py`, `compass/validation/content.py`
and `compass/utilities/ngrams.py`:

1. **Heuristic keyword pre-filter (cost control).** `Heuristic` counts hits across three vocabularies —
   single keywords, acronyms-in-context, multi-word phrases — and passes a chunk only above
   `match_count_threshold` (default 1). No LLM call runs on obviously irrelevant text.
2. **Legal-text classifier (relevance).** `LegalTextValidator` asks an LLM to *"identify text that is
   extracted from legally binding regulations (such as zoning ordinances or enforceable bans)"*, tracks
   `legal_text_score` as the FRACTION of chunks passing, and applies a `score_threshold` **capped at 0.8**.
   `parse_by_chunks` **aborts the document** if `min_chunks_to_process` (default 5) fail the legal check.
   ⭐ This is COMPASS's analogue of PRYZM's `regimeGate` — *is this text even a source of binding numbers?*
3. **Length buffer (cheap anti-hallucination).** `_TEXT_OUT_CHAR_BUFFER = 1.05`; if
   `len(extracted_text) > 1.05 * len(text)` the response is discarded — the model produced more text than
   it was given.
4. **⭐ N-gram containment (THE drift check).** `sentence_ngram_containment(original, test, n=4)` splits text
   into sentences, drops stop-words and punctuation, forms word 4-grams, and returns **the fraction of the
   CLEANED text's n-grams found in the ORIGINAL's n-gram set** (0 when the test text yields no n-grams).
   Thresholds are chosen by `doc.attrs.get("from_ocr", False)`:
   - `ngram_fraction_threshold = 0.9` for poppler-parsed (born-digital) text
   - `ngram_ocr_fraction_threshold = 0.75` for OCR'd text
   After `num_extraction_attempts` (default **3**) failures it abandons the field with *"Not returning any
   extracted text due to high possibility of LLM hallucination!"*

> ⭐ **The load-bearing insight is not the number 0.9.** COMPASS never asks the LLM for a *value*. It asks
> the LLM to **quote the relevant span**, verifies the quote is *actually in the source* by n-gram
> containment, and only then parses a number deterministically. **The LLM's job is RETRIEVAL, not
> arithmetic.** That is spec §20 — *AI interprets, deterministic computes* — implemented, and it is the
> pattern to take.
>
> ⛔ **And here is its honest limit, which PRYZM must not import blindly.** Containment is a **precision**
> measure in one direction only: it catches text the model INVENTED; it cannot catch text the model
> **OMITTED**. A model that quotes three words verbatim and silently drops the qualifying clause
> (*"höchstens"*, *"gilt nicht für Garagen"*, *"sofern ein Gestaltungsplan vorliegt"*, *"sous réserve de"*)
> scores **1.0**. For PRYZM that omission IS the overstatement — §L-616 in a different costume, and a
> direct breach of control 8. Containment must be paired with a **completeness** check PRYZM writes itself
> (§4.3).

### 2.2 How it binds a value to a source URL

Mechanically ordinary, and therefore robust: the retrieval stage records the document URL in the document's
attrs and carries it to the output row — *"every record carries a URL back to the original ordinance
document, so any value can be audited or spot-checked."* PRYZM's equivalent —
`RuleCitation{document, page, section, sentence}` plus
`ExtractionProvenance{documentId, page, cropRef, ordinanceRef, extractionModel, promptHash, crossChecks}` —
is **strictly stronger**: it cites a *sentence*, not just a document, and carries the gate verdicts.
**Nothing to adopt here; PRYZM is ahead.**

### 2.3 Its input assumption

`elm/utilities/parse.py` exposes **`read_pdf`** *and* **`read_pdf_ocr`**, plus `resembles_html` /
`html_to_text`. Runtime deps include **`pdftotext` (poppler)**, **`docling` / `docling-parse`** (IBM's
layout-model document converter), **`playwright`** and **`crawl4ai`** for retrieval, `nltk` for
sentence/stop-word handling, and **`pytesseract` in an optional `ocr` extra**. So COMPASS assumes **none**
of clean-text / OCR / HTML — it handles all three, and **records which one produced the text** (`from_ocr`),
then loosens the drift threshold accordingly. ⭐ **That flag is the pattern**: drift tolerance is a function
of the ingestion path. PRYZM's `DigitisationProfile` already carries the equivalent fact and currently gates
nothing on it.

### 2.4 ⛔ Adopt as PATTERNS. Not as a dependency. Not as a service.

**The answer is (a) port the PATTERNS** — stated plainly, because a Python dependency is not free:

- **(b) run it as a service — NO.** Python ≥3.12 + poppler and tesseract system binaries + `docling`'s
  layout models + a `playwright` browser + `nltk` corpora + an OpenAI/Anthropic key. That is a second
  runtime, a second deploy target, a second supply chain and a second on-call surface bolted onto a
  pnpm/TypeScript monorepo whose build already sets `--max-old-space-size=6144`. It buys **four functions'
  worth of logic**.
- **(c) neither — NO.** The four guards are real, cheap to re-express, and PRYZM has no equivalent of #4.
- **(a) port the patterns — YES, and the port is small.** Concretely worth taking:
  1. `sentenceNgramContainment(original, test, n = 4)` — **~30 lines of pure TS**, no dependency. The
     German/French stop-word lists are the only data, and under control 5 they belong in the per-country
     grammar adapter, never in the core.
  2. The **path-dependent threshold** (0.9 born-digital / 0.75 OCR) keyed off the EXISTING
     `DigitisationProfile.digitisation`.
  3. The **retrieve-then-verify contract**: the model returns a SPAN; the deterministic side parses.
  4. The **cheap-filter-before-LLM** ordering, and bounded `num_extraction_attempts` with honest
     abandonment rather than a best-effort guess.
- ⛔ **Do NOT adopt the datasets** (US energy siting), and **do not claim COMPASS works on a
  Bebauungsplan** — the D31 caveat stands and this lane found nothing to weaken it.

---

## §3 · TASK 3 — the corpora, measured

**The single fact that decides stage 1 differs per country. The audit's difficulty ordering is right — but
the DE number describes the wrong problem, and the FR and CH descriptions both need correcting.**

### 3.1 🇩🇪 DE / NRW — ⛔ the INDEX is machine-served; the DOCUMENTS largely are not

**Confirmed:** `https://ogc-api.nrw.de/inspire-lu-bplan/v1/collections/spatialplan/items` →
**`numberMatched: 82,007`**, one collection (`spatialplan`), each feature carrying `officialDocument`,
`texturl`, `sonsturl`, `kommune`, `gkz`, `planart`, `processStepGeneral`, `validFrom`. The audit's
"82k-plan machine-served document index" is **TRUE and genuinely excellent.**

**Then I fetched the documents.** Two sweeps, 137 features across 11 offsets, **31 documents actually
downloaded and opened with the repo's own `pdfText` adapter**:

| Link kind | attempted | opened as PDF | born-digital | scanned | **not-a-PDF (HTML @ 200)** | HTTP 404 |
|---|---:|---:|---:|---:|---:|---:|
| `officialDocument` | **21** | 10 | **2** | 8 | **9** | 2 |
| `texturl` | **9** | 9 | 8 | 1 | 0 | 0 |

Three findings, each contradicting something currently written down:

1. **⛔ Roughly half of `officialDocument` links do not return a document at all.** 9 of 21 returned
   `text/html` with **HTTP 200** (Velbert, Zülpich, Bielefeld 540 KB, Delbrück, Attendorn, Frechen,
   Lüdinghausen, Ennigerloh, Fröndenberg) and 2 more returned 404. ⭐ This is exactly the
   `AcquisitionFailureReason` taxonomy's `not-a-pdf` case — *"a portal HTML error page returned with status
   200 is the classic case"* — written into `ingest/types.ts` **from the Berlin corpus** and now confirmed
   independently on a second Land. **The taxonomy was right before it was needed.**
2. **⛔ The "13.3 % have a `texturl`, so 13.3 % are text-parseable" inference is FALSE, twice over.**
   `texturl` fill measured **9 / 80 = 11.3 %** (consistent with the GeoPackage's 13.3 %). But of those 9:
   - **1 is itself a scan** — Schieder-Schwalenberg, Producer `Lexmark X860de`, 5 pages, **0 characters**;
   - **8 are born-digital METADATA COVER SHEETS**, 218–441 characters, one page, containing **no planning
     parameter at all.** Verbatim, Odenthal `LandwehrA_1E`:
     > `Bauleitplanung Gemeinde Odenthal | Plan Nr. | § 35 | Planbezeichnung | Landwehr | Planstand |`
     > `1. Ergänzung | Planzeichnung | Textteil | Gutachten: | Artenschutz | Schalltechnik |`
     > `Hydrogeologie | Rechtskraft (Bekanntmachung) 07.08.2009 | Bemerkung:`
   - **Of 9 `texturl` documents measured, ZERO contained extractable ordinance text.**

   ⭐ **`chars > 0` is not `rules > 0`.** `classifyDigitisation` correctly labels a 224-character page
   `born-digital-text` (its threshold is 100 chars) — the classifier is not wrong, it is answering a
   different question. **A corpus statistic built on `digitisation` alone will overstate DE's text share,**
   and this lane is the measurement that shows by how much.
3. **The whole German grammar was run over the live sample and yielded ZERO rules** — 10 distinct
   municipalities' `officialDocument`s, 3 of which opened, all `scanned`, all 0 chars. Not a grammar
   defect: **there was no text to parse.** One corpus document is already OCR'd by its municipality
   (Hille, Producer `ABBYY FineReader 9.0 Sprint`, 14 pp, 10,859 chars) — that is the shape of the only
   cheap DE win currently visible.

> **Restatement owed to `E5-DATA-REUSE-REPORT.md` §B14 / `e5-devpotential-categories.md` §A-16.** The line
> *"OCR over scanned drawings for ~87 % of plans"* is derived arithmetically from `100 % − texturl 13.3 %`.
> Measured, the honest statement is both stronger and worse: **~87 % need OCR; the remaining ~13 % mostly
> do not contain the rules either; and about half of the document links do not resolve to a document.**
> ⭐ **DE is not the hard case because of OCR. It is the hard case because of ACQUISITION.** Budget the
> acquisition layer first; an OCR budget sized against 87 % of 82,007 plans is sized against a problem you
> cannot yet reach.
>
> One lead recorded and NOT pursued (control 10): several NRW links resolve through
> `xplanservices.krzn.de/…/xplan-wms/getAttachment` — an **XPlanung** service. Where a plan exists as
> XPlanGML, **parse the standard, not the PDF** (this is `pryzm-internal-review.md`'s own KEEP note).

### 3.2 🇨🇭 CH — ⭐ better than recorded, and the best-shaped input in Europe

`https://svc.geo.lu.ch/oereb/extract/json/?EGRID=CH873588275009` (Luzern parcel 3729) → 200, 74,962 bytes,
**10 restrictions, ALL 10 carrying `LegalProvisions`**. The zoning restriction dereferences to:

```text
LocalisedText : "Weitere Arbeitszone III"
Theme         : ch.Nutzungsplanung          TypeCode 4400
Lawstatus     : inForce                     AreaShare 2171 m²   PartInPercent 97
LegalProvisions[0]  Type.Code = "LegalProvision"
                    Title     = "Bau- und Zonenreglement (Luzern)"
                    URL       = https://geoshop.lu.ch/pdf/luze_BZR.pdf      Lawstatus: inForce
LegalProvisions[1..] Type.Code = "Law" → RPG (SR 700) · PBG (SRL 735) · PBV (SRL 736)
```

**The fetched legal provision, measured:** `luze_BZR.pdf` → **594,982 bytes · 46 pages · 69,714 chars ·
textPages 46/46 (100 %) · `born-digital-text` · Producer "Microsoft® Word für Microsoft 365"`.**
**Input = TEXT LAYER. No OCR. No LLM needed to READ it.**

⭐ **ÖREB maps onto the EXISTING attribution layer almost field-for-field, with nothing invented:**

| ÖREB field | `ParameterEvidence` seat | Note |
|---|---|---|
| `LegalProvisions[].Type.Code = "LegalProvision"` | `InstrumentKind: 'binding-plan'` | ⭐ the source TYPES the instrument for us |
| `Type.Code = "Law"` | `InstrumentKind: 'statute'` | RPG / PBG / PBV, each with an `OfficialNumber` |
| `Lawstatus.Code = "inForce"` | `LegalStatus: 'binding'` | published as metadata |
| — | `LegalStatusSource: 'metadata'` | ⭐ **the Denmark `bygkunifelt` shape, in a second country** |
| `LegalProvisions[].LocalisedText` (URL) | `RuleCitation.document` | exact PDF address |
| `PartInPercent` / `AreaShare` | applicability qualifier (control 8) | 97 % of the parcel — **not** 100 % |

⛔ **And the real CH difficulty is NOT reading — it is TABLE RECONSTRUCTION.** The BZR's binding numbers
live in *"Anhang 1 Zonen- und Dichtebestimmungen"*, a grid keyed by Ordnungsnummer:
`Nr. | Zonenart | A/B | ÜZ | GL | VG | FH | g/o | Weitere Bestimmungen`. Flattened to a text stream by any
item-joiner it reads:

```text
11 WA 0.2 3 offen    12 WA 0.2 4 offen    17 WA 0.25 25 3 offen    10 WA 0.15 21 geschlossen
```

The columns are **positionally ambiguous once flattened.** In `17 WA 0.25 25 3 offen` the `25` is
Gebäudelänge and the `3` is Vollgeschosse. In `10 WA 0.15 21 geschlossen` the `21` is **Fassadenhöhe 21 m**
— corroborated by row 60's escape into prose, *"Firsthöhe max. 21 m"*. **A line-based grammar reads
"21 Vollgeschosse" and overstates a 3-storey zone by 7×, with a correct citation attached.**

⭐ **This value would pass every existing guard.** The locale gate passes (`21` is a clean number), the
range gate passes (`maxFloors ∈ [1, 40]`), dual-pass agreement passes (both passes read the same flattened
stream), and an n-gram containment check passes (`21` really is in the source). It is §L-616 and
`§envelope-solid-overstates-partial-data` arriving through a new door: **a confidently-wrong value that no
character-level, statistical or agreement check can catch, because the error is in the GEOMETRY of the
page, not in the reading of the token.**

⭐ **This is exactly the hole §1.2 identified.** `CanonicalTable` is declared, `confident` is declared
load-bearing, and **nothing produces one.** CH is where that bill comes due first. The same document also
contains `Geschosszahl gemäss Zonenplan zulässig` — the `on-drawing` case the package already types
correctly.

### 3.3 🇫🇷 FR — ⚠ differently shaped than recorded: identity is national, ADDRESS is not

`apicarto.ign.fr/api/gpu/zone-urba`, six cities, probed 2026-09-01:

| City | `libelle` | `idurba` | `nomfic` | `urlfic` |
|---|---|---|---|---|
| Paris 11e | `UG` | `75056_PLU_20260616` | `75056_reglement_20260616.pdf` | **`""`** |
| Lyon | `UCe1b` | `200046977_PLUI_20260326` | `200046977_reglement_20260326.pdf` | **`""`** |
| Toulouse | `PSMV` | `31555_PSMV_20250217` | `31555_reglement_20250217.pdf` | **`""`** |
| **Marseille** | `UAp` | `200054807_PLUI_20260803_A` | `200054807_reglement_20260803_A.pdf` | ⭐ `https://plui.ampmetropole.fr/…/PLUi_CT1_L_Reglement.pdf` **`#page=80`** |
| Nantes | `US` | `244400404_PSMV_20231206` | `244400404_reglement_20231206.pdf` | `https://metropole.nantes.fr/psmv` *(landing page)* |
| Nice | `UBb1` | `200030195_PLUi_20260304` | `200030195_reglement_20250711.pdf`**`#page=64`** | `https://…/plu-métropolitain` *(landing page)* |

- **`idurba` + `nomfic` are 6 / 6** — document IDENTITY and version really are national and free, exactly
  as the lane recorded. That half stands.
- **`urlfic` is 3 / 6, and only 1 / 6 is a per-zone document ADDRESS.** Two are landing pages; three are
  empty. ⚠ `spain-france-portugal.md` §FR-1's *"links each zone to its règlement PDF (`nomfic`/`urlfic`)"*
  and *"règlement PDFs are addressable per zone"* need qualifying: **naming ≠ addressing.** A document
  RESOLUTION step (GPU document API keyed on `gpu_doc_id` / `idurba`, plus a per-métropole fallback) is
  real, unbudgeted work.
- ⭐ **The page anchor is the single most valuable field in the record, and it appears in EITHER field** —
  Marseille carries it on `urlfic`, Nice appends it to `nomfic`. It turns *"find zone UAp in 478 pages"*
  into *"start at page 80"*. **Any FR adapter must parse `#page=` off whichever field carries it.**

**The fetched règlement, measured:** `PLUi_CT1_L_Reglement.pdf` → **34,584,817 bytes · 478 pages ·
1,043,322 chars · textPages 478/478 (100 %) · `born-digital-text` · Producer `SAMBox 3.0.6`.**
**Input = TEXT LAYER — at 34 MB and ~1 MB of text per métropole.**

⛔ **But French is the LEAST grammar-tractable of the three.** `"hauteur maximale"` appears **once** in 478
pages; the binding numbers live in prose — *"hauteurs de façade maximales pouvant atteindre 19 mètres"*,
*"peuvent dépasser de 6m les hauteurs façades"*. And naive keyword matching is actively dangerous here:
grepping `CES` (Coefficient d'Emprise au Sol) returns overwhelmingly the French word **"ces"** (*these*).
**FR is the case that genuinely needs AI interpretation** — which is precisely why the containment guard,
the qualifier-survival gate and the never-graduate lock matter most there.

### 3.4 The one fact that decides stage 1, per country

| | Input | Stage 1 | Hardest part |
|---|---|---|---|
| **🇨🇭 CH** | **text layer** (100 %) | none — parse directly | ⭐ **table reconstruction** (`CanonicalTable`) |
| **🇫🇷 FR** | **text layer** (100 %), 478 pp | page-anchored zone scoping | ⭐ **prose interpretation** (AI, guarded) |
| **🇩🇪 DE** | **scan** (~87 %), and **~50 % of links are not documents** | ⭐ **acquisition**, then OCR | ⭐ **acquisition** |

---

## §4 · TASK 4 — the recommendation

### 4.1 The smallest spine that turns a document into a tier-4 claim with evidence

Six stages: `acquire → read → STRUCTURE → interpret → VERIFY → attribute`. **Four already exist.**

| # | Stage | State | Action |
|---|---|---|---|
| 1 | **Acquire** — URL → bytes, with the 8-way failure taxonomy | ✅ types in `ingest/types.ts`; adapter in `tools/ordinance-ingest/lib/httpCache.ts` | **PROMOTE.** Give the CLIs a home in the build graph (F-6). The measured 9/21 `not-a-pdf` rate makes this taxonomy load-bearing, not decorative. |
| 2 | **Read** — bytes → per-page text + `DigitisationProfile` | ✅ `pdfText.ts` + `pdfItems.ts` + `classify.ts` + `normalize.ts`, regression-tested against two real corpus defects | **REUSE VERBATIM.** Nothing to build. This lane drove all 31 corpus measurements through it unchanged. |
| 3 | **⭐ STRUCTURE** — positioned items → `CanonicalDocument{sections, tables}` with honest `CanonicalTable.confident` | ⛔ **TYPES ONLY. ZERO PRODUCERS.** | ⭐ **BUILD. THIS IS THE ONE MISSING LAYER.** CH's Anhang 1 and DE's Nutzungsschablone both die here, and §3.2 shows the failure is invisible to every existing guard. `confident: false` must be a first-class output: a table we could not reconstruct is **reported as such**, never emitted as plausible rows. |
| 4 | **Interpret** — structured text → candidate value + **verbatim span** | 🟡 deterministic half exists (`extractRules` + `JurisdictionGrammar`); the AI half is a **port with no implementation** | **BUILD ONE `DualPassExtractor`**, on COMPASS's contract: **the model returns a SPAN; the deterministic side parses the number.** Grammar first (CH), AI only where prose defeats it (FR). |
| 5 | **VERIFY** — the gate battery | ✅ 7 gates + coherence, all tested; ⛔ plus two PRYZM lacks | **REUSE the 7. PORT the 8th** — `sentenceNgramContainment` with the path-dependent threshold keyed off `DigitisationProfile`. **WRITE the 9th (§4.3).** |
| 6 | **Attribute** — which correct reading BINDS | ✅ `resolveParameter` + `ParameterEvidence`, 10 stages, DE/DK/Madrid tables, genuinely wired | **REUSE.** Add a **CH priority table as DATA** (control 5) — ÖREB hands us `InstrumentKind` and `LegalStatus` for free (§3.2). |

**The spine's output is not a number.** It is a `RuleProvenance` record carrying
`derivation: 'AI_EXTRACTED'`, `valueLocation: 'in-document-text'`, `confidence.tier: 4`, and
`source{document, article, page}` — a shape the **FROZEN** L0 schema already validates and already refuses
to let reach tier 1 or tier 5. **Write the producer. Do not touch the schema (control 3).**

### 4.2 Build / adopt / defer

**BUILD — three things, and only three:**

1. **Layer 3: the `CanonicalDocument` producer with table reconstruction** and honest `confident`. *The* item.
2. **One `DualPassExtractor`** on the span-return contract, routed through `ai-host` per C23.
3. **The first `AI_EXTRACTED` producer** — the adapter that emits `RuleProvenance` at tier 4.

**ADOPT — as patterns, ported to TS, never as a dependency (§2.4):**

4. `sentenceNgramContainment(original, test, n = 4)` + path-dependent thresholds (0.9 / 0.75).
5. Retrieve-then-verify: the model quotes; the parser computes.
6. Cheap-filter-before-LLM ordering; bounded retries with honest abandonment.
7. COMPASS's `LegalTextValidator` **only as confirmation that PRYZM's `regimeGate` is the right shape** —
   PRYZM's is better, because it is a cited legal-regime table rather than an LLM classifier.

**DEFER — recorded, not started (control 10):**

8. **DE OCR at scale.** ⛔ Do not start it. Fix ACQUISITION first (~50 % of links are not documents), then
   harvest the already-OCR'd subset (ABBYY producers), then reconsider. The current cost line is sized
   against a problem you cannot yet reach.
9. **The XPlanGML branch for DE** (`xplanservices…/getAttachment`) — parse the standard, not the PDF.
10. **A `CanonicalTable` for German Nutzungsschablonen** — same machinery as CH, but DE has no text layer to
    run it on yet. **CH first**, because CH pays for the machinery with a working corpus.
11. **The C58-ladder ↔ E1a-six-tier mapping.** Needs stating; needs **no new tier** (control 2).

**REFUSE — this lane refused these, and the build lane should too:**

- Any `packages/schemas/**` change. The spec-§20 guard is already there and FROZEN (control 3).
- A rival extraction package. `@pryzm/ordinance-extraction` is the existing solver; extend it.
- Any automatic tier-4 → tier-5 path. `canGraduateTier` and the L0 `superRefine` both forbid it; keep both.
- Raising the CH range-gate `maxFloors` bound to accommodate the flattened-table reading. **The 21 is a
  height, not a storey count. Fix the reader; never the bound.**

### 4.3 ⭐ The gate PRYZM must write that COMPASS does not have

Containment catches **fabrication**. It cannot catch **omission** — and omission is how a European ordinance
overstates (§2.1). The missing gate — the **qualifier-survival check** — asks: *does the emitted rule carry
every qualifier the cited sentence contained?* If the source sentence holds `höchstens` · `gilt nicht für` ·
`sofern` · `Gestaltungsplanpflicht` · `sous réserve de` · `au plus`, and the emitted rule carries no
applicability qualifier, **flag**. That is control 8 (*semantic qualifiers must survive normalization*)
turned into an executable check, and it is the natural home for the `§CORPUS-NEVER-JITTERED` discipline:
**perturb the fixture with a scramble control**, so the gate is proven able to fail before it is trusted to
pass.

### 4.4 ⭐ The number that matters — what a MEASURED precision trial needs

**First, the unit.** COMPASS validates **per document**. PRYZM must validate **per (parcel, parameter)
claim** — the object that actually reaches a buildable envelope. One 478-page règlement yields hundreds of
claims of wildly differing difficulty; a per-document accuracy figure would be uninterpretable for PRYZM's
purpose and would flatter the easy cases.

**Second, the sizing.** 95 % confidence, half-width for a proportion, finite-population correction,
N ≈ 10,000 claims. **The control ran first (§0 row 15): the formula reproduces COMPASS's published
±13.83 % at n = 50 exactly.**

| n | worst case (p = 0.5) | on a good extractor (p = 0.9) |
|---:|---:|---:|
| 50 | ±13.83 % | ±8.30 % |
| 100 | ±9.75 % | ±5.85 % |
| **200** | **±6.86 %** | **±4.12 %** |
| 300 | ±5.57 % | ±3.34 % |
| 384 | ±4.90 % | — |
| 500 | ±4.27 % | ±2.56 % |

**Third — and this matters more than n — how they must be DRAWN.** A trial that says anything honest must be
**stratified**, because a single pooled number would be dominated by whichever country contributed most
claims:

- **By country** — CH (table) · FR (prose) · DE (OCR) are three different measurements wearing one name.
- **By ingestion path** — `born-digital-text` / `hybrid` / `scanned`. The drift threshold already differs by
  path; the precision will too.
- **By value shape** — plain number · **table cell** · prose · rule-reference (`on-drawing` / `derived`).
  ⭐ **Table cells will carry most of the error (§3.2) and must not be diluted by easy prose numbers.**
- **Randomly WITHIN each stratum, drawn from the live register** — never from documents chosen because they
  parsed. **Selecting on parse success is how a corpus certifies itself.**

**The recommendation, as a commitment:**

> ⭐ **Stratified. ~100 human-labelled claims per stratum (±9.8 % worst case, ±5.9 % on a working
> extractor), at least 3 strata — so ~300 total for a first honest reading, and ~500 (5 strata) to report
> per-country. Below ~50 per stratum, say nothing: the interval is wider than the gap between "usable" and
> "dangerous".**

Two conditions, both non-negotiable:

1. **Ground truth is a human reading the cited sentence and recording the correct value — with `UNKNOWN` and
   `REFUSED` as first-class valid labels** (control 9). A trial whose label set is only *right number /
   wrong number* cannot measure the failure PRYZM most cares about: **a number emitted where the honest
   answer was no number.**
2. **Report precision, recall, and the OVERSTATEMENT RATE separately.** An extractor that is 95 % precise
   and overstates one envelope in twenty on real land is not shippable, and a single blended accuracy
   figure hides exactly that. COMPASS publishes sample sizes without a ground-truth method; **PRYZM must
   publish the method or publish nothing.**

---

## §5 · Discoveries recorded, not acted on (control 10)

| id | Finding | Owner |
|---|---|---|
| **F-1** | `attribution/index.ts` header *"DELIBERATELY WIRED TO NOTHING"* is **stale** — `evaluateDeclarative.ts:602/:623` is the producer it was waiting for. Documentation-only correction. | E1c / docs |
| **F-2** | `resolveParameter` **name-collides** with `packages/family-runtime`'s unrelated resolver (~20 call sites). Any audit of this seam must filter by import source, not by name. | build lane |
| **F-3** | **No GA gate covers `packages/ordinance-extraction`** — 0 of 76. The tier lock is enforced at the L0 schema and at the render, never at the producer. | build lane |
| **F-4** | `check-refusal-identity` **RC=3, pre-existing**: 109 findings vs baseline 67, **42 unbaselined**, essentially all in `apps/editor` / `geometry-wall` / plugins. One offender is the **untracked** `countryAdapters/no/noMatrikkelClient.ts:224` (sibling E7-NO lane). ⛔ Not this lane's to fix, and **must not be baselined away**. | fleet |
| **F-5** | `check-provenance-not-invented` **RC=3, pre-existing**: STALE LEDGER — a declared entry at `ZoningRulesEngine.ts:163` has drifted to `:181`; plus `siteDispatch.ts:3619` unledgered. Line drift from sibling lanes. It names `packages/site-parcel-data`, so the build lane will hit it. | fleet |
| **F-6** | `tools/ordinance-ingest/` (4 CLIs, mtime 2026-08-09) sits outside the build graph — no `package.json`, no npm script, no CI. It is the only caller of `extractRules`. | build lane |
| **F-7** | DE: several NRW `officialDocument` links resolve through **XPlanung** (`xplanservices…/getAttachment`). Where XPlanGML exists, parse the standard. **Not pursued.** | later lane |
| **F-8** | DE: ~50 % of `officialDocument` links return **HTML at HTTP 200** or 404. **Acquisition, not OCR, is DE's first bill.** | E5 re-budget |
| **F-9** | FR: `urlfic` is 3/6 and only 1/6 is a document address; the **`#page=` anchor** appears in `urlfic` OR appended to `nomfic`. Any FR adapter must read both. | FR lane |
| **F-10** | CH: ÖREB publishes `InstrumentKind` and `LegalStatus` as **metadata** — the Denmark `bygkunifelt` shape in a second country. A CH priority table is DATA, not logic. | CH lane |

---

## §6 · Refusals

- **Refused any `packages/schemas/**` change** (control 3). None was needed: the spec-§20 guard is already
  frozen there and already rejects `tier 1 + AI_EXTRACTED`, `tier 1 + in-document-text`, and
  `tier 5 without HUMAN_VALIDATED`.
- **Refused to propose a new package, a new tier, or a new canonical entity** (controls 2 and 4).
- **Refused to touch `src/index.ts`, `sourceRegistry/*`, `parcelProviders/*` or any `countryAdapters/<cc>/`;
  no parcel provider registered** (L-12871 stays OPEN). No barrel line was needed — this lane wrote exactly
  one file: this report.
- **Refused to fix, baseline, or ledger F-4 / F-5.** Both are pre-existing reds outside this lane's subject,
  and a ratchet-exceeded exit is never absorbable as debt (§RATCHET-EXCEEDED-IS-NEVER-DEBT).
- **Refused to recommend a Python dependency or a COMPASS service**, and refused to describe either as free.

---

*Lane E8-SCOUT complete 2026-09-01. 15 executed verifications, 31 corpus documents fetched and measured
first-hand through the repo's own instrument, 3 live national services probed, 1 falsification control
passed. READ-ONLY throughout: no production file changed, nothing committed.*
