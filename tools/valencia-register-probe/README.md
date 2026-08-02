# València register probe — the ER-3 route, priced

Sibling of [`../valencia-grammar-probe/`](../valencia-grammar-probe/) (read-only reference — that
run refuted the grammar hypothesis and established the PROVEN WFS transport). This run answers the
one thing that survived it:

> `url_abs` — 542 distinct URLs for 542 municipalities, 100% populated, zero missing.
> **Can the ordenanza be reached and parsed from it?**

---

## ⛔ THE HEADLINE

**Reading a València ordenanza from `url_abs` is EXPENSIVE.**

The route is **real** — not the UrlLink trap. `url_abs` resolves to a live, per-municipality,
expediente-keyed document register, and the ordenanza **is in it**, filed under a consistent
section name. Reaching it is free.

**Parsing it is not.** All three registers opened deliver the base ordenanza as an
**IMAGE-ONLY SCAN**. Zero extractable characters, zero embedded font programs, exactly one
scan-codec image per page. Outcome **(c)** — three for three, across three provinces and three
size classes. The 542-register route is a **542-municipality OCR programme**, at Barcelona's
digit-integrity tier, on documents whose entire value is numbers.

---

## Run

```bash
node 01-pick-and-resolve.mjs   # purposive sample of 3; resolves url_abs. Filter gate, both halves
node 02-open-registers.mjs     # open the 3 register roots
node 03-walk-register.mjs      # walk each tree to the leaves (writes _03_tree.json)
node 04-open-ordenanza.mjs     # ⭐ THE RUN — download + extract the 3 base ordenanzas
node 05-scan-confirm.mjs       # explain the zero: independent PDF-structure confirmation
node 06-corpus-sniff.mjs       # calibrated Range sniff — is ANYTHING here machine-readable?
node 07-regex-control.mjs      # positive control for step 4's parameter regexes
node 10-operacionbaja.mjs      # service surface + full field union + expediente census
node 11-currency-area.mjs      # ⭐ is the measured layer CURRENT? asked geometrically
```

`_docs/` (~104 MB of scanned PDFs) is gitignored; every URL is recorded in `_03_tree.json` and in
the `TARGETS`/`CONTROLS` tables of steps 4 and 7. `_*.json` are the measured results.

---

## The sample — PURPOSIVE, and declared as such

Three municipalities, chosen to span the two axes that plausibly drive register quality:
**settlement size** and **province** (the register is filed under three provincial trees, so a
per-province difference in filing practice was a live hypothesis — it was not observed).

| INE | Municipality | Province | Class | Why chosen |
|---|---|---|---|---|
| `46250` | València | València | large urban | the capital; the polygon set the grammar hypothesis was refuted on |
| `12135` | Vila-real | Castelló | mid-sized (~51k) | different provincial filing tree |
| `03130` | Tollos | Alacant | small rural (~32–40 inh) | smallest tail; the grammar probe's independent known-positive (13 polygons) |

**This is n=3 of 542. It bounds nothing statistically.** It answers whether the route is real.
The three did **not** disagree, which is the result that generalises least ambiguously — but a
larger sample is a stated gap, not a discharged one.

---

## Result per register

All three: **reachable, HTTP 200, no auth wall, Apache `mod_autoindex`**, filed
`<INE>-<serial> <year>-<expte> <TITLE> / <n> <SECTION> / <file>.pdf`.

| Municipality | Instrument | Ordenanza file | Pages | Codec | Outcome |
|---|---|---|---|---|---|
| València | PGOU 1988 Texto Refundido `46250-1001 / 1991-0010` | `3 NORMATIVA/… NORMAS URB.pdf` | 376 | **JBIG2** | **(c)** image-only scan |
| Vila-real | PG Villarreal `12135-1000 / 1992-0322` | `2 Memoria/… NNUU-1.pdf` + `NNUU-2.pdf` | 147 + 164 | CCITT G4 / JPEG | **(c)** image-only scan |
| Tollos | Delimitación de Suelo Urbano `03130-1000 / 1989-0701` | `3 NORMAS URBANISTICAS/….pdf` | 41 | JPEG | **(c)** image-only scan |

**Not (d).** The ordenanza IS in the register — this is not a metadata-only routing layer.
**Not (e).** Nothing is dead or auth-walled.
**It is (c), and (c) is the expensive one.**

### The zero was explained before it was reported

Three identical zeros is the shape of a tool failure — the corpus already contains one
(`CQL_FILTER` accepted-and-silently-ignored: HTTP 200, plausible data, identical totals). So the
zero was not reported until an **independent** source agreed:

| | poppler `pdftotext` | PDF object structure (raw bytes, no poppler) |
|---|---|---|
| 46250 | 0 chars / 376 pp | 0 font programs · 376 JBIG2 images |
| 12135 NNUU-1 | 0 chars / 147 pp | 0 font programs · 147 CCITT images |
| 12135 NNUU-2 | 0 chars / 164 pp | 0 font programs · 164 JPEG images |
| 03130 | 0 chars / 41 pp | 0 font programs · 41 JPEG images |

Exactly **one image per page** and **zero embedded fonts** in every file. Two independent sources
agree; the zero is real.

### ⚠ NATIONAL FINDING — València's PGOU is JBIG2

The 376-page València scan is **JBIG2**-encoded. JBIG2's symbol-matching mode is the codec with
the documented **digit-substitution** failure mode: visually similar glyphs are replaced by a
shared symbol, silently and with no visual artefact. For a document whose entire value is
**heights in metres, setbacks in metres and percentages**, that is a correctness landmine
*upstream of OCR* — the pixels themselves may already be wrong. Any OCR pipeline over Spanish
planning scans needs a JBIG2 detector and a digit-integrity gate, and this is not specific to
València. Barcelona's digit-integrity gate already rejected one such scan.

---

## Is anything in these registers machine-readable?

Step 6 sniffs a decade-stratified, seeded sample via HTTP `Range`, **after calibrating** the
512 KB head sniff against the four files whose answer step 5 already proved (calibration
**PASSED**, 4/4).

| Municipality | PDFs in tree | Sniffed | SCAN | BORN-DIGITAL | Undecided |
|---|---|---|---|---|---|
| València | 479 (tree truncated at 400 dirs) | 20 | 13 | 7 | 0 |
| Vila-real | 694 | 16 | 12 | 3 | 1 |
| Tollos | 5 | 4 | 4 | 0 | 0 |

Born-digital documents appear **only from ~2015 onward**, and are overwhelmingly the
**administrative certificate** (`Inscripción Registro`), not the technical normativa. Every
1990s and 2000s document sampled is a scan; Tollos is 4/4 scans and has no post-1989 instrument
at all.

**This does not rescue the route.** The born-digital documents that ARE normative are
**single-article amendments** — `PGMOD ART. 260.4`, `PGMOD ART. 264.2`, `PGMOD art 245`. An
amendment amends one article. You cannot derive a zone's height, setback, occupation and depth
from the amendments; you need the base plan, and the base plan is the scan.

---

## ⛔ The regex control caught a defect in this probe

Step 4 reported `height=0 setback=0 occupation=0 depth=0`. **A regex that does not match is not
an absent field** — the grammar probe reported "FAR absent from every schema" and was wrong
because `edif_m2` did not match its pattern. So step 7 runs *the same regexes, uncorrected* over
five **born-digital** planning documents from the same register.

`height`, `setback`, `occupation`, `far` and `parcelMin` all **fire**, on real ordinance prose:

> *"…b) Coeficiente de edificabilidad neta: 1,50 m2t/m2s, en el GEC-5 de 4,5 m2t/m2s.
> c) Número máximo de plantas: 4…"*
> *"…- ocupación máxima: 5% - altura máxima: 3m - separación a lindes: 5m…"*

**`depth` never fired on any control.** So the step-4 zero for buildable depth is
**UNATTRIBUTED** and is **not** reported as absence. Checked further: the bare words
`fondo` / `profundidad` / `profunditat` / `fons` appear **0 times** in all five control
documents — so the regex is not demonstrably broken, the vocabulary is simply absent from
single-article amendments. **`depth` regex status: UNVALIDATED, no positive control available in
this corpus.** Not "works", not "broken".

---

## `operacionbaja` — REFUTED as stated, referent UNKNOWN, but the question behind it is ANSWERED

### The field

**ABSENT.** Established three independent ways:

1. **Full field union, stem-matched not compound-matched.** All 6 typenames of
   `0702_Planeamiento` → **78 distinct field names**, dumped in full in `_10_operacionbaja.json`.
   Stems `baja`, `alta`, `operac`, `vigen`, `derog|anul|nul`, `sustit|supers|reempl`: **zero hits
   each.** Only `f_aprob/f_autoriza/f_inicio/f_public/f_recep` (approval dates) and
   `situacion/situacion_val` come near, and none expresses supersession.
2. **The served payload, not just the advertised schema** — `GetFeature` CSV headers for all 6
   typenames carry no such column.
3. **ICV's own published data model** —
   `icvficherosweb.icv.gva.es/04/geonetwork/definicion_datos/0702_urbanismo_planeamiento_mdatos.pdf`,
   opened and text-extracted: `operacion` = 0, `baja` = 0, `alta` = 0, `fecha` = 0 over 43,808
   chars. **The ICV planning model has no lifecycle field of any kind.**

**Service surface widened, and it is a surface of one.** `0700/0701/0703/0704/0705_Planeamiento`,
`07_Planeamiento`, `Planeamiento`, `0201_Catastro`, `0801_Urbanismo` all **404**.
`0702_Planeamiento` is the only planning WFS on `terramapas.icv.gva.es`.

**Nearest real homonym, PROVEN from primary source but in a DIFFERENT dataset:** the Dirección
General del Catastro cadastral-cartography shapefile model carries `FECHAALTA`/`FECHABAJA` —
*"Fecha de dibujo del elemento gráfico"* / *"Fecha de borrado del elemento Gráfico"*, sentinel
`99999999` = still current. Same *concept* (`baja` = removal), **different name, different
dataset, different jurisdiction level**, and `OPERACION` appears **0 times** in that manual.

⇒ **Referent: UNKNOWN.** Eliminated: the `0702_Planeamiento` schema (3 ways); the ICV data model;
every sibling ICV service name probed; Catastro's documented exchange formats; any public web
occurrence of the literal token. **Not eliminated:** the national **SIU** model — all three
candidate primary documents were 403 / 404 / field-less. `endLifeSpan` was already eliminated by
the prior run (no INSPIRE provenance) and was not re-derived.

### ⭐ The question behind it — and this is the part that mattered

`operacionbaja` mattered for one reason: **if it meant supersession, every València figure might
be drawn from superseded geometry.** That question does not need the field name. Step 11 asks it
geometrically.

If the layer retained struck-off polygons beside their replacements it would **double-cover**
re-planned ground, and Σ polygon area would exceed the municipal area. Measured, in EPSG:25830
metres, exterior minus interior rings:

| INE | Σ zonificación | término municipal | ratio | reading |
|---|---|---|---|---|
| 46250 | 137.28 km² | 134.65 km² | **1.020** | partition |
| 12135 | 55.06 km² | 55.12 km² | **0.999** | partition |
| 03130 | 14.46 km² | 15.97 km² | **0.905** | partition |

**No double coverage anywhere.** València's 3,589 polygons carry 139 distinct expedientes — the
1988 PGOU alone accounts for 2,025 — and they still sum to one municipality. The layer is a
**CONSOLIDATED MOSAIC**: each modification's polygons *replace* the base plan's over their
footprint, tagged with the expediente that set them.

⇒ **The measured layer is CURRENT** on this evidence. Status: **proven** for the necessary
condition; see the two limits below.

#### ⚠ Two limits, stated not buried

1. **Necessary condition only.** Overlap would *prove* retention; absence of overlap is
   *consistent with* "current only" but does not prove it — a superseded polygon geometrically
   identical to its replacement would not inflate the sum. This test can falsify the mosaic
   reading; it cannot confirm it.
2. **The "internal control" was degenerate, and is disclosed rather than quietly dropped.** This
   step was written to cross-check `Zonificacion` against `Clasificacion`. Measured directly:
   both typenames return n=600 for Vila-real with the **same feature ids** — they are **two views
   of one table**. The `×CLAS = 1.000` the script prints is structurally guaranteed and is **not
   evidence**. (`Dotaciones` IS a distinct subset — 357 of 600 — so the three names are not all
   aliases.) The only genuine control here is the external municipal area.

---

## Method defects this probe committed, and how each was caught

Recorded because a probe that gets the answer wrong quietly is worse than one that fails loudly.

| # | Defect | Caught by | Consequence had it stood |
|---|---|---|---|
| 1 | Layer-name filter required an `ms:` prefix that `GetCapabilities` does not carry | union came back **0 fields** — a zero with no explanation | "`operacionbaja` absent" asserted about a surface never looked at |
| 2 | `'03130'` written as a bare number → **octal literal** | Node refused it at parse time | silent truncation of every Alacant/Castelló INE code to 4 digits |
| 3 | Tollos area hardcoded at **4.68 km²**, unsourced and wrong (it is 15.97) | the resulting 3.09× ratio was implausible; sourced properly | would have **fabricated** the exact "retained supersession" signal the step exists to detect |
| 4 | `dictsVisible` guard abstained whenever `/ObjStm` was present | two spurious `UNKNOWN`s on Vila-real | over-conservative — could only cause a false UNKNOWN, never a false SCAN. Corrected: per ISO 32000-1 §7.5.7 stream objects cannot live in an object stream, so the font/image signals are always visible |
| 5 | `<a\s ` link regex required two whitespace chars | step 2 found **0 links** in a page that plainly had them | "register is empty" |
| 6 | `Content-Type: charset=UTF-8` on a body that is **ISO-8859-1** | mojibake in accented filenames | decode is now validated, never trusted — filenames are how the ordenanza is identified |

Defect 3 is the serious one: **an unsourced denominator is not a control, it is a way to
manufacture the finding you went looking for.**

---

## What this run did NOT measure

Stated, not estimated.

- **539 of 542 registers were not opened.** n=3 is purposive and bounds nothing statistically.
  Whether the (c) verdict holds region-wide is **untested** — cheap to test, since step 6's
  calibrated 512 KB Range sniff costs ~0.5 MB per document.
- **València's register tree was truncated** at the 400-directory crawl budget (510 of ~1,000+
  files enumerated). The three-section filing structure was consistent across everything seen,
  but the tail is unwalked.
- **No OCR was attempted**, so the *achievable accuracy* of the OCR route on these scans is
  **untested**. "Expensive" here means "requires OCR + a digit-integrity gate", not "proven to
  fail".
- **The `depth` (fondo edificable) regex is UNVALIDATED** — no positive control existed in the
  born-digital subset.
- **Municipal-website escape hatch: only partly established.** València's own site publishes a
  born-digital text copy (157 pp, 435 KB) labelled *"(Transcripción)"* — established by prior
  work, not by this run, and it carries an authority caveat: it is a re-keying, not the deposited
  original. Whether Vila-real and Tollos have equivalents was delegated and **the check did not
  complete** — treat as **untested**, not as absent.
- **The area control is SECONDARY-sourced** (Wikipedia infoboxes, opened not snippeted).
  `ine.es` was unreachable from this box, so the primary INE table was not obtained.
- **SIU** remains the one un-eliminated home for `operacionbaja`.
