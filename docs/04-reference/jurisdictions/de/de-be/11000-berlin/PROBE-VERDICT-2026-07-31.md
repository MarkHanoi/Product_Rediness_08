# Berlin B-Plan pipeline — PROBE VERDICT (live-tested 2026-07-31)

> **Status:** LIVE-PROBED · **Date:** 2026-07-31 · **Source:** founder live probe (WFS `GetCapabilities` / `GetFeature` + PDF text extraction) · **Governs:** corrects assumptions in `gis/bplan-source.json`, `plans/8-30-neukoelln/metadata.json`, `NEXT.md`.

---

## VERDICT: **YES — the Berlin pipeline succeeds end-to-end** (mixed-corpus qualifier)

The dossier's dead-ends and dual-endpoint discrepancy were **resolved by live probing on 2026-07-31**. Every WFS layer the product needs resolves live under an open licence; the 8-30 Begründung is a born-digital **text** PDF (no OCR needed); and the exact planning parameters (GRZ 0,3 / GFZ 0,9) were **read out of the primary source**. The pipeline works. The remaining effort is not plumbing — it is the **German free-text Begründung extractor**.

This is a **qualified YES**: the corpus is MIXED. Modern §13a plans ship born-digital text; some legacy plans have only a scan. See §5.

---

## Evidence

### 1 — Production endpoint = the LEGACY `bplan` WFS, NOT `plu_bplan` (resolves the DISCREPANCY)

The dossier flagged a dual-endpoint DISCREPANCY (`plu_bplan/inhalt` VERIFIED-SCHEMA vs `bplan/scan_www` CONVERGENT-SECONDARY) with **no winner asserted**. Live probe asserts the winner:

- **`bplan` is the production extraction endpoint** — `https://gdi.berlin.de/services/wfs/bplan`, WFS 2.0.0, CRS **EPSG:25833**, licence **DL-DE/Zero-2.0**, **no access restriction**.
- FeatureTypes (live `GetCapabilities`):
  - `bplan:b_bp_fs` — **festgesetzt** (in-force) — carries document fields.
  - `bplan:c_bp_ak` — außer Kraft (repealed) — carries document fields.
  - `bplan:a_bp_iv` — **in-Verfahren** (in procedure) — **NO document fields** (expected: not adopted, nothing to link).
- `plu_bplan` (the INSPIRE PLU service) **also responds live**, but its document link is INSPIRE-modeled and **indirect** (via an `OfficialDocumentation` object, not a direct PDF).
- **Rule for extraction: query `bplan:b_bp_fs` / `bplan:c_bp_ak`.** Reserve `plu_bplan` for INSPIRE-conformant interchange, not for pulling the PDF.

### 2 — The real document-link field is `grund_www`, NOT `inhalt`

The `inhalt` field name was the **`plu_bplan`/INSPIRE assumption** and is corrected. On the production `bplan` layer the document fields are:

| Field | Meaning | Role |
|---|---|---|
| **`grund_www`** | "Link zum Begründungstext" (the reasoning/justification text) | **THE EXTRACTOR'S TARGET** — this is where GRZ/GFZ/height/storeys are stated in prose + Festsetzungen |
| `scan_www` | "Link zur Planzeichnung" | the drawing (Planzeichnung PDF) |
| `url_www` | portal page | human-facing portal link |

`a_bp_iv` (in-Verfahren) has none of these — expected, because the plan is not yet adopted.

### 3 — `GetFeature` + CQL locates 8-30 with links populated

`GetFeature` on `bplan:b_bp_fs` with `CQL_FILTER planname LIKE '8-30%'` returns **Neukölln 8-30** with:

- `scan_www` → `…/planzeichnung/8-30.pdf`
- `grund_www` → `…/begruendung/begruendung-8-30.pdf`

### 4 — DECISIVE: the 8-30 Begründung is a TEXT-LAYER (born-digital) PDF, not a scan

The dossier's design carried an OCR-fallback worry (`PDF_SCAN` bucket, L-449-OCR). For modern §13a plans that worry is a **FALSE ALARM**:

- The 8-30 Begründung is **215 pages**, from which **637,988 characters** of clean German text were extracted directly from the **Flate content streams** — i.e. **born-digital text**, not a raster scan.
- The extracted text contains the exact planning parameters verbatim:
  > **"(GRZ) von 0,3 sowie einer Geschossflächenzahl (GFZ) von 0,9"**
  plus Vollgeschosse and the **§13a BauGB** basis.
- The earlier "scanned" worry was **Flate compression mistaken for a raster** — it is compressed text, not an image.
- **Conclusion: the text-parse path works. NO OCR is needed for modern §13a plans.** L-449-OCR is not on the critical path for the modern corpus.

### 5 — HONEST QUALIFIER: the corpus is MIXED (text vs scan)

The YES is qualified because Berlin's ~7,000-plan corpus is not uniform:

- **Modern §13a plans** (e.g. 8-30) ship a **born-digital text** Begründung via `grund_www` → text-parse works, no OCR.
- **Some LEGACY plans** (e.g. Mitte `0100002b`) have **`grund_www = null`** and only a scan (`scan_www`) → the **OCR fallback is still worth building**, but it is **NOT the common case**.
- The **text-vs-scan mix-rate across the ~7,000 plans is an unrun sampling question.** Do not assert a percentage until sampled. This is the `digitisation classifier` measurement (EXTRACTION-PIPELINE.md §4.2) — now with a corrected default expectation: modern plans are text.

### 6 — ALKIS is a live WFS (+ building-footprint bonus)

- `alkis_flurstuecke:flurstuecke` — parcels — **live WFS**, EPSG:25833.
- **BONUS:** `alkis_gebaeude:gebaeude` — **building footprints** — also live and WFS-queryable. This is the live building substitute for LoD2 (see §7).

### 7 — LoD2: the 404 is REAL — it is NOT a WFS

The dossier's `lod2-source.json` recorded a 404 and marked the endpoint PROBE-GATED. Live probe confirms the 404 is **real and structural**:

- **LoD2 is not served as a WFS.** It is a **CityGML ATOM bulk-download**: `gdi.berlin.de/data/a_lod2/atom/` (confirmed live).
- **Live building substitute:** use `alkis_gebaeude:gebaeude` (WFS, §6) for building footprints; ingest LoD2 heights via a **CityGML-ATOM ingestion path**, not a WFS query.

---

## STATUS 2026-07-31 (code)

The German free-text extractor now exists as `@pryzm/ordinance-extraction` (`textExtract/` core +
`grammars/german.ts` + `envelope/` mapper + `gates/regimeGate.ts`), 167 tests, on main
(`2cb81d81`...`43166863`). It parses the section-4 verbatim fragment into cited values at the
`pipeline-extracted-unverified` tier. **The 8-30 row remains `pending-L449`** - the code reads the
values, it does not sign them off.

### CORRECTION 2026-07-31 (later the same day): the quoted fragment is the SUPERSEDED instrument

An earlier version of this section reported the extraction as **GRZ 0,3 / GFZ 0,9**, quoting section 4
of this verdict. **That is the wrong instrument, and a pack built on it would be wrong.**

Running the full ingestion chain over the real 8-30 document yields **four** GRZ readings - `0,3`,
`0,39`, `0,4`, `0,8` - and **every one is a correct reading of the text**. Only one binds:

| Value | Instrument | Status |
|---|---|---|
| **GRZ 0,4 / GFZ 1,2** | **B-Plan 8-30 Festsetzung** | **BINDING** |
| GRZ 0,3 / GFZ 0,9 | 1958/60 Baunutzungsplan, *dargestellt* (section 5 BauGB) | **superseded depiction** |
| 0,39 | derived/contextual | not a Festsetzung |
| 0,8 | elsewhere in document | **taking this overstates footprint 2x** |

The verdict's section-4 quote is the **Baunutzungsplan's depiction**, not 8-30's Festsetzung. Fixture
and tests are corrected accordingly.

> **This is the core lesson of the whole German phase.** The grammar was never wrong - it read every
> value correctly. What no parser could do was decide **which correctly-read value binds**. That is
> semantic attribution (instrument + zone), and it is a **document-model** problem, not a grammar or
> normalisation problem. See
> [`../../findings/GERMANY-PDF-INGESTION-WP1-WP6.md`](../../findings/GERMANY-PDF-INGESTION-WP1-WP6.md).

> **The first real fragment BROKE the parser.** `"(GRZ) von 0,3 ..."` starts mid-sentence, so the bare
> abbreviation arrived carrying a closing parenthesis and the matcher died on it. Every hand-written
> test had passed because they all supplied the long form. Fixed via `KEYWORD_TAIL` - but that is a
> **point fix**; generalised normalisation (dangling punctuation, wrapped lines, page furniture,
> ligatures, soft hyphens) is outstanding. Treat "167 tests green" as *not* evidence of working on
> real documents.

**Status of the gaps this verdict originally listed** (all measured 2026-07-31, see
[`../../findings/GERMANY-PDF-INGESTION-WP1-WP6.md`](../../findings/GERMANY-PDF-INGESTION-WP1-WP6.md)):

| Gap | Now |
|---|---|
| PDF acquisition | **BUILT** - polite caching fetcher, per-host serialised, SHA-256, fetch-once-ever |
| Text-layer extraction | **BUILT** - 209/209 pages yielded text on 8-30 (591,289 chars) |
| Normalisation | **BUILT** - the GRZ-class failure is now structural, replacing the point fix |
| Text-vs-scan mix (section 5) | **MEASURED, no longer unsampled** - see below |
| OCR fallback | still missing |
| **Baugebiet / instrument attribution** | still missing - **and now identified as THE bottleneck** |
| Nutzungsschablone table grid | still missing; a seeded sample of the drawing-only population found **21/21 pure raster, 0 chars**, so this is OCR-then-table-on-image, not text-table parsing |

**The section-5 sampling gap is closed.** Census of the full in-force population (**n = 2,840, not a
sample**): 43.3% carry a Begründung link, **56.3% expose only the drawing**, 0.3% nothing. Of 258
documents examined (500 requested, **258 actually examined and 258 reported**), 250 classified:
**63.2% born-digital, 36.8% scanned, ZERO hybrids** - the corpus is strictly bimodal, so routing is a
clean binary with no partial-salvage tier to build.

**Combined: ~27.4% of in-force Berlin B-Plans are reachable by the text pipeline today** - not 43.3%,
because a third of the Begründungen are themselves scans.

> A politeness failure nearly corrupted this figure: a first run earned **284 x HTTP 429** from
> `www.berlin.de`, recorded as `http-error`. That would have reported ~31% download success and made
> the corpus look a third smaller. `rate-limited` is now its own reason code, requests are serialised
> per host, and the 343 poisoned records were purged and re-examined. **Rate-limited, errored, and
> absent are three different results.**

## WHERE THE REAL EFFORT IS

The effort is **NOT** where the dossier's blocker list weighted it:

- **NOT the WFS plumbing** — every layer resolves live under an open (DL-DE/Zero-2.0) licence.
- **NOT OCR for modern plans** — those are born-digital text.

The real effort is:

1. **PRIMARY — the German free-text Begründung EXTRACTOR.** Parse `"GRZ von 0,3"` etc. out of running German prose **and** out of the Festsetzungen tables, into structured **GRZ / GFZ / height / storey** params. This is a structured-extraction problem over legal German, not a GIS problem.
2. **SECONDARY — a scan/OCR fallback** for the legacy plans that have only `scan_www` (see §5).
3. **SECONDARY — a LoD2 CityGML-ATOM ingestion path** (bulk download → parse → heights), since LoD2 is not a WFS (§7).

---

## Corrections applied (this probe → dossier files)

| File | Was | Now (per this probe) |
|---|---|---|
| `gis/bplan-source.json` | dual candidates, **no winner**; doc field `inhalt`; `plu_bplan` primary | `bplan` = **production winner**; doc field **`grund_www`** (+ `scan_www`, `url_www`); DISCREPANCY **RESOLVED**; FeatureTypes `b_bp_fs`/`c_bp_ak`/`a_bp_iv`; no access restriction |
| `plans/8-30-neukoelln/metadata.json` | ordinance URL "extraction pending"; scan/OCR unknown | Begründung is a **confirmed text-PDF** (`grund_www` populated); **GRZ 0,3 / GFZ 0,9 PRESENT IN SOURCE**; row stays **`pending-L449`** (probe SAW them; formal extraction + sign-off is the next step — not fabricated as "verified") |
| `NEXT.md` | probe #1 "resolve which endpoint is production"; LoD2 404 unresolved | endpoint **RESOLVED** (`bplan`); doc field **`grund_www`**; OCR **not** on modern critical path; LoD2 = **CityGML ATOM**, not WFS; `alkis_gebaeude` live |

**8-30 fixture status is deliberately held at `pending-L449`:** the probe *saw* GRZ 0,3 / GFZ 0,9 in the primary source, but formal extraction + L-449 sign-off into a served row is the next step. Do **not** fabricate the row as "verified".

---

*All facts on this page are from the live probe of 2026-07-31 (WFS `GetCapabilities`/`GetFeature` + PDF text extraction). Related: `gis/bplan-source.json` · `gis/alkis-source.json` · `gis/lod2-source.json` · `plans/8-30-neukoelln/metadata.json` · `EXTRACTION-PIPELINE.md` · `NEXT.md`.*
