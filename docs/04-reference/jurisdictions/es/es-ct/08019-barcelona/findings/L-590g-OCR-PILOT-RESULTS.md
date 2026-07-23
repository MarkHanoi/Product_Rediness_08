# L-590g — The OCR mini-pilot, RUN: five documents read by vision, field by field

**2026-07-23.** `L-590f` decided **pilot before build**. This file is that pilot, executed headless
with the vision capability already in hand: five scanned/near-scanned ordinance documents — **three
Barcelona Pla Parcials across three eras + two Córdoba PGOU ordinances (the transfer test), plus one
born-digital Córdoba ordinance found by accident** — fetched live, rendered to 200-DPI images, and
**read directly, cell by cell, with every field tiered for honesty.** It converts `L-590f`'s three
unknowns (real accuracy, the true shape of the input, cross-city transfer) from assumptions into a
first measurement.

> ## HEADLINE — three findings, each of which changes the build decision
>
> 1. **Vision extraction WORKS on the clean part of the corpus and is legible-but-treacherous on the
>    hard part.** Of the 5 documents, the two born-2001 Córdoba ordinances and the 1993 Barcelona
>    plan read at essentially 100%; the 1968 Barcelona parameter table read ~90% with **two cells I
>    could not reconcile**; the 1956 Barcelona typescript is readable but **contains no buildable
>    number to extract at all.**
> 2. **🔴 The `L-590e` classifier "0 extractable chars ⇒ SCAN" conflates two independent axes and
>    OVER-states the OCR wall.** "No text layer" is NOT "hard to OCR." Measured here, `0-char`
>    documents span the whole difficulty range from a **pristine born-digital raster** (Córdoba
>    `O_OA1`, `O_PAS2` — trivial OCR) to a **faded 1956 typewriter** (Barcelona 72016 — hard). The
>    char-count measured text-LAYER presence; it never measured IMAGE quality, which is the axis that
>    actually decides OCR feasibility. **Much of the "scan wall" is clean raster.**
> 3. **🔴 The real wall is not OCR — it is SUFFICIENCY. The buildable parameters that a parcel-level
>    answer needs are (a) keyed to block LABELS whose geometry lives in an un-OCR-able plànol, or
>    (b) stated as an ALGORITHM ("ocupación = resultante de aplicar los parámetros"), or (c) a base
>    value that only appears on a drawing.** Perfect character extraction is **necessary and not
>    sufficient** for the envelope. This is the finding that most changes the cost model.

⚠ **Scope honesty.** Five documents is a feasibility read, not a precision estimate. Nothing here
licenses shipping a number. It sizes the problem and stratifies it; the precision number comes from
the Part-C protocol (`ORDINANCE-EXTRACTION-PIPELINE.md` §Protocol), not from this file.

---

## 1 — What was fetched (all VERIFIED-LIVE 2026-07-23, reproducible)

| # | city | documentId / file | instrument · date | pages | bytes | text layer | **image regime** |
|---|---|---|---|---:|---:|---|---|
| B1 | Barcelona | RPUC `72016` (`dun.pdf`) | Congrés Eucarístic modif. · **1955/56** | **1** | 111 KB | 0 chars | **degraded typewriter** |
| B2 | Barcelona | RPUC `73609` | PP Can Figuerola / Patronato Ribas · **1968** | 24 | 1.2 MB | 0 chars | **faded pink typewriter + tables** |
| B3 | Barcelona | RPUC `89134` | PP Diagonal Mar (clau 11) · **1993** | 82 | 14.5 MB | 0 chars | **clean modern laser scan** |
| C1 | Córdoba | `O_INDUSTRIAL.pdf` | PGOU-2001 TR 2002 · IND zone | 6 | 40 KB | **~4227 chars** | **BORN-DIGITAL TEXT** |
| C2 | Córdoba | `O_OA1.pdf` | PGOU-2001 TR 2002 · OA zone | 2 | 514 KB | 0 chars | **clean born-digital raster** |
| C3 | Córdoba | `O_PAS2.pdf` | PGOU-2001 TR 2002 · PAS zone | 3 | 744 KB | 0 chars | **clean born-digital raster** |

Fetch (Barcelona) — the `L-590e` §1 endpoint, no cookie/UA-block:
`https://dtes.gencat.cat/RPUC-portal/rest/consulta/documents?documentId=<N>&downloadType=inline&idioma=ca`.
Fetch (Córdoba) — the es-an `SOURCES.md` B1 endpoint, **http→https 301, follow it**:
`http://visor.pgou.coacordoba.org/doc/ordenanzas/O_<ZONE>.pdf`.
Render: PyMuPDF 1.28, `Matrix(200/72)` → PNG. Read: the images, directly.

---

## 2 — 🔴 The measurement-honesty correction that reframes everything: "0 chars" ≠ "hard scan"

`L-590e` §4 classified Barcelona's Pla Parcials **100% SCAN (33/33)** on the rule `<50 chars/page`.
That is a **correct measurement of the wrong quantity for the OCR question.** It measured whether a
**text layer** exists. It did not — could not — measure **image quality**, which is the axis that
decides whether OCR succeeds. This pilot separates the two axes for the first time, and they are
nearly orthogonal:

| document | `L-590e` class | **actual OCR difficulty (measured by reading it)** |
|---|---|---|
| Córdoba `O_OA1`, `O_PAS2` | would classify **SCAN** (0 chars) | **trivial** — crisp black-on-white born-digital raster, ~100% |
| Barcelona `89134` (1993) | classed **SCAN** (0 chars) | **easy** — clean laser scan, ~99% |
| Barcelona `73609` (1968) | classed **SCAN** (0 chars) | **hard** — faded pink typewriter; digits ambiguous |
| Barcelona `72016` (1956) | classed **SCAN** (0 chars) | **hardest** — degraded typescript, torn, stamped |

⇒ **Consequence for the ceiling.** `L-590e`/`L-590c` §11.5 read "100% scans" as "100% OCR wall." The
truth is softer on one side and harder on the other: **a large share of the 0-char corpus is
clean raster that OCR reads at ~99%** (so the OCR wall is *lower* than stated), **but the parameters
that matter often are not text at all** (so the *sufficiency* wall is *higher* than stated — §5).
Neither correction was visible to a char-count. Both are visible the moment you look at the page.
**This is `§CONTEXT-DATA-HONESTY` one level up again: a proxy metric (char count) stood in for the
quantity of interest (extractability), and the proxy was wrong in both directions.**

---

## 3 — BARCELONA field-level results (per document, per field, tiered)

Tiers: **CONFIDENT** (I read it and I would stake the pilot on it) · **AMBIGUOUS** (I have a
best-guess but a digit/cell is genuinely uncertain — a human must confirm) · **ABSENT** (the field
is not in the document — a 0 here is honest emptiness, not OCR failure) · **NOT-TEXT** (the value
exists but as geometry/drawing, unreadable as characters).

### 3.1 — B1 · `72016` · 1956 Congrés Eucarístic (the degraded-typescript case)

The entire `dun.pdf` is **one page of *memoria*** — a narrative "Estudio de modificación de
alineaciones y ordenación de las manzanas de viviendas del Congreso Eucarístico", signed *Barcelona,
23 de febrero de 1955*. Torn top-left corner; red-pen archive mark "42-B-10" and "tres"; a violet
"ARCHIVO 42-B-10" stamp.

| field | value | tier | note |
|---|---|---|---|
| governing zone/clau | — | **ABSENT** | doc is a pre-PGM alignment study; no clau |
| governing article | *no PGM article; refs "Plan de Urbanización del Ayuntamiento" + Instituto Nacional de la Vivienda* | CONFIDENT | but not a buildable-rule article |
| alçada / height | — | **ABSENT** | |
| edificabilitat / FAR | — | **ABSENT** | |
| ocupació | — | **ABSENT** | |
| setbacks | — | **ABSENT** | |
| approval date | 1955-02-23 (memoria) / 1956-07-16 (`detall dataAprovacio`) | CONFIDENT | |

> 🔴 **The document is ~90% readable and yields ZERO buildable fields — not because OCR failed, but
> because the document contains none.** The `L-590e` enumerator picked the "most-normative-named"
> document (`dun`) and for this expedient that document is a **1-page memoria**. A field-recall
> metric computed on this doc would read 0/N and would be **falsely blamed on OCR.** The real lesson:
> **document SELECTION inside an expedient is a first-class failure mode, upstream of OCR.** The
> parameters, if they were ever recorded, are in a *different* document of the same expedient (an
> *ordenanzas* text or the plànols) that the "most-normative-name" heuristic did not pick.

### 3.2 — B2 · `73609` · 1968 PP Can Figuerola / Patronato Ribas (the TABLE case — the highest-risk one)

- **p000 (approval act):** "*Aprobar definitivamente el PLAN PARCIAL DE ORDENACION DE LAS FINCAS CAN
  FIGUEROLA Y PATRONATO RIBAS*", *acuerdo 1-VIII-68*, observations a)–d). Obs. b): "*Se dejará
  pendiente la construcción del edificio 'T', de **15 plantas**…*". **CONFIDENT** read — but this is a
  per-building, conditional figure (construction deferred), **not** a zone height. Reporting "15
  plantas" as this plan's height would be a confident-wrong answer. Refs *Art. 41 de la Ley del
  Suelo*.
- **pp007–008 ("Datos y coeficientes" tables):** the buildable data. Columns *Bloque · Sup. planta m²
  · Altura en nº de plantas · Sup. edificada m²*, then a second *Zona B* table.

**Heights per block (the field that matters), CONFIDENT:**

| block | plantas | block | plantas | block | plantas |
|---|---|---|---|---|---|
| A | 4 | K,L,M | 6 | S | 6 |
| B,C,D | 5 | O | 6 | W | 6 |
| E,F,G | 10 | P | 10 | a,b,c,d,e,f | 6 |
| H,I,J | 6 | Q,R | 8 | Zona B: B1–B5 | **B+11** |
| | | | | Zona B: B6 | **B+13** |

**⭐ A free in-document verification signal — the arithmetic cross-check.** The table is internally
redundant: `Sup.planta × plantas = Sup.edificada`. Running it against my reads:

- **12 of 14 legible rows RECONCILE exactly** (A: 444,15×4 = 1.776,60 ✓; E: 304,46×10 = 3.044,60 ✓;
  Q: 1.153,74×8 = 9.229,92 ✓; R: 1.297,20×8 = 10.377,60 ✓; …).
- **Row H FLAGGED:** 241,63×6 = 1.449,**78**, but I read the last cell as 1.449,**81** — the
  arithmetic caught a **two-digit misread** I would otherwise have shipped as confident.
- **Row I FLAGGED, irreconcilable:** 247,50×6 = 1.485,00, but the built-area cell reads 1.361,25 —
  I **cannot** reconcile these (1.361,25/6 = 226,875 ≠ 247,50). One of the three cells in that row is
  wrong and I **cannot tell which from the image alone.** → **AMBIGUOUS, route to human.** This is the
  single most valuable line in the pilot: an honest "I cannot read this row."

> 🔴 **The two confident-wrong traps this page makes concrete:**
> 1. **Ditto marks.** In the *Zona B* table, B2–B5's *Sup. total* cells are a **`"` ditto** of B1's
>    6.426,48. A table parser that does not model ditto marks will drop them or, worse, pull down
>    B6's 7.585,84 — attaching the wrong total to four blocks. Exactly L-526 at cell scale.
> 2. **The label→geometry gap (NOT-TEXT).** Every height above is keyed to a **block letter**
>    (A…f, B1–B6). Which parcel *is* block "E" (10 storeys) vs block "A" (4 storeys) is drawn on the
>    **plànol** — a separate scan that OCR reads as pixels, not geometry. **Perfect table extraction
>    yields "block E = 10 storeys" and still cannot answer "what may I build on THIS parcel"** without
>    vectorising a drawing. Necessary, not sufficient (§5).

### 3.3 — B3 · `89134` · 1993 PP Diagonal Mar (the clean-scan case)

Crisp modern laser scan (0 text layer, but ~99% OCR-legible). Parameters live in **prose Normes
Urbanístiques articles**, not tables.

| field | value | tier | source page |
|---|---|---|---|
| sector superfície | 341.983 m² | CONFIDENT | p010 "Límits" |
| occupancy cap | "*la suma de les superfícies de sòl ocupat … no podrà superar **7,1758 Hes***" | CONFIDENT | p040 Art. 10.3 |
| alçada reguladora | "*podrà augmentar-se fins a un **5%***" (a MODIFIER; base value on plànol **O 1.2**) | CONFIDENT (modifier) / **NOT-TEXT** (base) | p040 Art. 10.3 |
| governing frame | Decret Legislatiu 1/1990; Estudis de Detall in àmbit "t" clau 11 | CONFIDENT | p040 |

> The clean scan is easy to READ; the difficulty is that the alçada **base** value is a per-block
> figure on drawing *O 1.2* and the article only states a ±5% tolerance on it. Same NOT-TEXT gap as
> B2, in a document where every character is crisp.

---

## 4 — CÓRDOBA field-level results — the TRANSFER test, and it transfers with a surprise

### 4.1 — 🔴 The corpus is MIXED, not uniformly scanned — the es-an `SOURCES.md` generalisation was over-broad

es-an `SOURCES.md` B1 states the 15 ordinance PDFs are "**scanned images, no text layer
(`pdftotext`→3 chars)**." **Measured here, that is not uniformly true:** `O_INDUSTRIAL.pdf` carries a
**clean ~4227-char/page text layer** — a **born-digital** PDF of the PGOU-2001 Texto Refundido. It
needs **no OCR at all**, only an encoding fix (the dump showed `�` where ó/ñ/í belong — a Latin-1/UTF-8
decode issue, not an extraction failure). `O_OA1` and `O_PAS2` have no text layer but are **pristine
born-digital rasters** — trivial OCR. **The es-an catalogue's "all scans" was itself a proxy
generalisation from an under-sample** (§CONTEXT-DATA-HONESTY, same family as §2). ⇒ **Append a note to
es-an `SOURCES.md` B1: the corpus is heterogeneous; profile each of the 15 before assuming OCR.**

### 4.2 — C1 · `O_INDUSTRIAL` (clean TEXT pull, IND-1, Art. 13.11.2) — CONFIDENT throughout

| field | value | tier |
|---|---|---|
| zone | IND-1 (industria escaparate) | CONFIDENT |
| parcela mínima | 750 m²; fachada mín. 20 m al vial principal | CONFIDENT |
| edificabilidad neta máx. | **1,16 m²t/m²s** | CONFIDENT |
| setbacks | viario principal 10 m · secundarias 5 m · linderos privados 5 m | CONFIDENT |
| altura máxima | **15 m** (excepcionalmente 20 m) | CONFIDENT |
| **ocupación máxima** | "*resultante de la aplicación de los parámetros…*" | **ALGORITHM, not a number** |
| governing article | Art. 13.11.2 | CONFIDENT (literal text) |

> ⚠ **The algorithmic-rule trap, live (L-590f §2.4).** Ocupación here is **not a stored value** — it
> is defined as the outcome of applying the other parameters. An LLM asked "what is the max occupation
> for IND-1?" will be tempted to **compute and report a number**, manufacturing a citeable figure the
> ordinance does not state. The honest extraction is `ocupación = null, rule = "derived"`, **not** a
> percentage. Also present: a conditional supersession rule inside the article — for parcels from
> *planeamiento de desarrollo aprobado con anterioridad*, the prior plan's setbacks **prevail** over
> this article's. A naive extractor flattens that conditional into an unconditional 5 m.

### 4.3 — C2 · `O_OA1` (clean raster, Art. 13.6) — CONFIDENT throughout

| zone | edificabilidad neta | ocupación máx | altura | parcela mín · setbacks |
|---|---|---|---|---|
| OA-1 | **1,4** m²t/m²s | **40%** (sótano garaje 60%) | **PB+3 = 12,5 m** | 600 m² (círculo 25 m); linderos ≥ ½h, mín 3 m; vallas 1,5 m |
| OA-2 | **1,6** m²t/m²s | 40% | **PB+6 = 21 m** | limitación en Unidad de Actuación |

Small in-text table (subzona → índice: OA-1 1,4 / OA-2 1,6). Every cell CONFIDENT.

### 4.4 — C3 · `O_PAS2` (clean raster, Art. 13.7) — CONFIDENT values, HIGH layout-trap risk

Four separate subzone tables, **two-column page**, all keyed by the **same PAS-1/2/3 labels**:

| subzona | edificabilidad | parcela mín (m²) | fachada mín (m) | ocupación |
|---|---|---|---|---|
| PAS-1 | 1,2 | **2.000** | 30 | 40% |
| PAS-2 | 1,66 | **1.500** | 30 | 50% |
| PAS-3 | 2,00 | **3.000** | 40 | 40% |

All values CONFIDENT to a careful reader — **but this page is the cleanest illustration of the
confident-wrong risk in the whole pilot:**
1. **Repeated labels × 4 tables × 2-column layout.** PAS-1's *ocupación* (40%, right column) and
   PAS-1's *edificabilidad* (1,2, left column) sit far apart; a model reading in the wrong order can
   cross-wire PAS-2↔PAS-3 or attach an *ocupación* to the wrong subzone. **The right value on the
   wrong subzone is the exact L-526 failure — and here it is one mis-ordered read away.**
2. **Locale number format, mixed on one page.** `1,66` is comma-**decimal**; `2.000` is
   period-**thousands**. A parser using the anglophone convention reads parcela mínima as **2.0 m²**
   instead of 2000 — a 1000× error that still "looks like a number."

> **Córdoba transfers — and it is EASIER than Barcelona, not harder.** The ceiling-slice we cared
> about is a **2001-2002 consolidated plan**: some ordinances born-digital text, the rest clean
> raster. There is no faded-typewriter, no handwriting, no torn page. **The horizontal capability
> applies, but the per-city difficulty is wildly asymmetric** (Barcelona 1955-1978 typewriter vs
> Córdoba 2001 laser), which means city SELECTION should weight OCR difficulty, not treat "has scans"
> as one bucket (see `ORDINANCE-EXTRACTION-PIPELINE.md` §Protocol depth-vs-breadth).

---

## 5 — 🔴 The finding that most changes the cost model: OCR is necessary, not sufficient

Across all five documents, the parameters a **parcel-level envelope** needs fall into three shapes,
and **only the first is solved by reading characters:**

| shape | example | solved by OCR? |
|---|---|---|
| **stated number** | Córdoba OA-1 altura 12,5 m; edificabilidad 1,16 | ✅ yes — this is the extractable win |
| **algorithm / derivation** | Córdoba IND-1 ocupación "resultante de aplicar los parámetros"; Barcelona Art. 242.2 (our own) | ❌ no — extract the RULE, never a fabricated value |
| **label / drawing binding** | Barcelona B2 heights keyed to block letters; B3 alçada base on plànol O 1.2 | ❌ no — the value is geometry, not text |

⇒ **The extractable win is real but bounded.** For a modern consolidated plan (Córdoba) whose
ordinance keys parameters directly to a *calificación code* that a GIS polygon already carries, OCR
(or a text pull) closes the loop: `parcel → calificación polygon → ordinance code → extracted
number`. For an old Barcelona Pla Parcial whose parameters are keyed to **block labels drawn on a
plànol**, extraction gives you a **parameter dictionary with no key into it** — you still need the
drawing to say which block a parcel is in. **This is why the honest cost estimate must separate
"extract the parameters" (tractable) from "bind them to a parcel" (a second, harder, partly
un-OCR-able problem), and why the `pipeline-extracted-unverified` tier (design doc §3) must never
imply parcel-level certainty even when the character extraction is perfect.**

---

## 6 — The input distribution actually observed (informs feasibility more than any assumption)

| axis | Barcelona sample (3 docs, 107 pp) | Córdoba sample (3 docs, 11 pp) |
|---|---|---|
| era | 1955 / 1968 / 1993 | 2001-2002 (all) |
| text layer | 0/3 | **1/3 born-digital text** |
| clean raster | 1/3 (the 1993) | 2/3 |
| faded typewriter | 2/3 | 0 |
| handwriting | marginalia only (archive marks, "Cotejado", page-no. in words) — **no handwritten PARAMETER seen** | none |
| tables | yes (73609) | yes (OA1, PAS2) |
| parameters as prose | yes (89134) | yes (INDUSTRIAL) |

⚠ **Honest gap in this sample:** `L-590f` §2.2 names **handwritten marginalia amending numbers**
("crossed out 9,15 m, wrote 9,45 m") as the worst-accuracy, most-consequential case. **I did not hit
one in these five documents** — the handwriting I saw was archival, not normative. That case remains
**un-measured**, and the Part-C protocol must deliberately hunt for it (it is the one the auto-gates
are least able to catch, because an amendment that changes a value passes every arithmetic and range
check).

---

## 7 — What this says to the go/no-go (feeds `ORDINANCE-EXTRACTION-PIPELINE.md`)

1. **Vision extraction is viable** on clean raster + born-digital + clean-laser (≈ the majority of the
   0-char corpus by the §2 correction) and **degrades gracefully-but-dangerously** on faded
   typewriter, where the failure is a **plausible wrong digit**, not a blank.
2. **The dual-pass + a free in-document check (arithmetic, range bounds) already caught 2 of my own
   errors** on one table (§3.2). That is direct evidence the verification design (`L-590f` §3) is not
   theoretical — it works, and it is cheap.
3. **The dominant risk is not character accuracy — it is (a) confident-wrong table/layout
   misalignment, (b) algorithms reported as numbers, (c) the parcel-binding gap.** A precision number
   that only measures character accuracy would be **misleadingly high** and would miss all three.
   The Part-C human-verification must score **field-correct-AND-correctly-attributed**, not
   char-accuracy.
4. **Transfer holds; difficulty is asymmetric.** Córdoba is cheaper than Barcelona and partly
   OCR-free. The depth-vs-breadth calculus (`L-590f` §5) must be run with **three** corpus shapes, not
   two: (i) old-scanned-derived-plan wall (Barcelona), (ii) modern-consolidated-clean-ordinance
   (Córdoba), (iii) general-plan-governs-directly (no OCR).

---

## 8 — REPRODUCE

```bash
# Barcelona (RPUC document endpoint, L-590e §1)
H="https://dtes.gencat.cat/RPUC-portal/rest/consulta"
curl -s -A "Mozilla/5.0" "$H/documents?documentId=73609&downloadType=inline&idioma=ca" -o 73609.pdf
# Córdoba (es-an SOURCES.md B1 — http 301 -> https, follow with -L)
curl -sL -A "Mozilla/5.0" "http://visor.pgou.coacordoba.org/doc/ordenanzas/O_PAS2.pdf" -o PAS2.pdf
# render + read
python -c "import pymupdf; d=pymupdf.open('73609.pdf'); \
  d[7].get_pixmap(matrix=pymupdf.Matrix(200/72,200/72)).save('p7.png')"
```

Pilot scripts (this session, scratchpad): `pdfprobe.py` (text-layer classify), `render.py`
(page→PNG at DPI), `dumptext.py` (text-layer dump), `ARITHCHECK.txt` (the §3.2 cross-check).
Documents fetched: BCN 72016/73609/89134, Córdoba O_INDUSTRIAL/O_OA1/O_PAS2.

---

**Related:** `L-590f-OCR-PIPELINE-DECISION.md` (the decision this executes) ·
`L-590e-RPUC-BARCELONA-CORPUS-MEASUREMENT.md` §4 (the "0-char = scan" classifier this corrects) ·
`../../es-an/14021-cordoba/sources/SOURCES.md` B1 (the "all scans" generalisation this corrects) ·
`../../../../ORDINANCE-EXTRACTION-PIPELINE.md` (the horizontal architecture + production protocol).
