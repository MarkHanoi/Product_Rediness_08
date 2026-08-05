# Córdoba (INE 14021) — Casco Histórico DWF/PDF Vector-Source Investigation, 2026-08-05

> **Task type: PURE INVESTIGATION.** No rule pack, dispatcher, provider, or `*_ENVELOPE_VERIFIED`
> flag was touched. No code was written. Every claim below is backed by a live fetch or a
> `pdftotext`/`pdfminer` extraction run this session; file paths to the actual evidence are given
> so it can be independently re-run. Sample PDFs are saved under
> `docs/04-reference/jurisdictions/es/es-an/14021-cordoba/corpus/CH-DWF/` (see `MANIFEST.md` there).

---

## Executive summary

**Verdict: PARTIALLY — and the useful half is not the file family the founder flagged.**

The two files the founder found (`G32ayuntamiento.pdf`, `C32_ayuntamiento.pdf` under the legacy
`.../planos/ch/dwf_ch/` path) are real, and one of them (`G32...`) is genuinely vector — but it
carries only **one** text label for the entire sheet (`AR.CH. A1`), confirming it is the **Áreas
de Reparto / Gestión** overlay, exactly as suspected, and **not** the ordinance/protection code.

Investigating *why* `C32_ayuntamiento.pdf` (with the underscore) 404'd and a differently-spelled
`C32ayuntamiento.pdf` (no underscore) worked led to the real discovery: the two "found" files are
stale mirrors of a **canonical, indexed, 30-sheet PEPCH plan series** at
`gmucordoba.es/pepch-planos`, organised as two parallel sets covering all 14 historic-centre
districts:

- **`caliyges/C##_district.pdf`** — "Calificación y Gestión" (matches the G/C files found — sparse,
  point/area markers for catalogued items and Áreas de Vinculación/Actuación, **not** a
  per-parcel classification).
- **`edificacion/E##_district.pdf`** — "Edificación" (**not previously in the founder's screenshots**)
  — genuinely vector, and **this is the file that carries the per-building protection/ordinance
  classification** the CUS raster series cannot deliver.

The Edificación (`E##`) sheets are dense with real embedded text: label pairs like `CC 16`,
`EA 62`, `EV 79`, `MA 7`, `MV 35`, `MC 3` repeated **hundreds of times per sheet**, each at a
distinct (x, y) position matching an individual building footprint (verified via `pdfminer`
bounding boxes, not eyeballed). Cross-referenced against the PEPCH normativa text
(`Artículo 43`–`49`), this is confirmed to be exactly the plan the ordinance itself points to:
*"Las parcelas calificadas de protección tipológica se identifican en el plano de edificación
(ES)"* and *"El número máximo de plantas autorizable es el que se recoge para cada parcela en el
plano de edificación (ES)."* **The Edificación plan is the PEPCH's own authoritative source for
per-parcel protection category and per-parcel maximum floor count** — this is not an inference,
it is what the ordinance text says about itself.

**What is still missing / not yet closed (hence "partially", not "yes"):**

1. The exact full-name meaning of each 2-letter code (`MC`, `CC`, `EA`, `EV`, `MA`, `MV`) was not
   found written out anywhere in the fetched PDFs or the normativa text as a literal legend — it
   is inferred from context (chapter titles, code frequency, and code-pair symmetry: `EA`/`MA` and
   `EV`/`MV` look like the same two protection levels applied at building-scale vs. block-scale).
   This inference is **not yet independently confirmed** and must not be treated as settled.
2. The number following each code (e.g. the `16` in `CC 16`) is almost certainly a catalogue
   cross-reference ID (values run 1–254, too large and too irregular to be a floor count), not the
   floor count itself. The floor count that Artículo 49 promises is on this same plan is **not yet
   located** in the extracted text — it may be encoded as a separate numeral cluster we did not
   isolate, or via a symbol/hatch pattern rather than text. This needs a follow-up pass before any
   height number can be trusted.
3. Only the `ayuntamiento` (district code 32) tile pair was inspected in full depth; the code
   vocabulary was checked across all 15 Edificación sheets (§3) but per-sheet legend boxes were not
   individually verified.

---

## 1. What is actually published

### 1.1 The founder's path is a legacy/stale mirror, not the canonical index

`https://gmucordoba.es/documentos/Gerencia_de_Urbanismo/imagenes_planos/planos/ch/dwf_ch/` returns
**403 Forbidden** on directory listing (no autoindex), and only two of the ~200 numeric-guess
filenames tried (`G01ayuntamiento.pdf` … `G80ayuntamiento.pdf`, `C01ayuntamiento.pdf` …
`C80ayuntamiento.pdf`, with and without underscore) returned HTTP 200:

```
200  G32ayuntamiento.pdf
200  C32ayuntamiento.pdf
```

(Full scan log preserved at
`docs/04-reference/jurisdictions/es/es-an/14021-cordoba/corpus/CH-DWF/MANIFEST.md` reference —
the raw scan lists are in the session scratch dir, not committed, since they are 100 % 404 noise.)

This made sense only after finding the real index: **"32" is not a sequential sheet number — it's
the district code for "Ayuntamiento"**, one of 14 named historic-centre sub-districts. The
`dwf_ch` path apparently only still serves the one district whose slug happens to collide with a
numeric-looking guess; there is no reason to believe sheets "01"–"80" exist there at all under this
naming scheme.

### 1.2 The canonical index: `gmucordoba.es/pepch-planos`

This page (fetched live) lists, in full, **28 real PDF links** — two per district × 14 districts —
plus links to Introducción/Memoria/Normas Urbanísticas text documents:

**Planos de Calificación y Gestión** (`.../pepch/planos/caliyges/`):
`C12_olleria`, `C13_marrubi`, `C21_tejares`, `C22_santama`, `C23_sanlore`, `C31_grancap`,
`C32_ayuntamiento`, `C33_magdale`, `C41_trinida`, `C42_calleferia`, `C43_santiag`, `C51_alcazar`,
`C52_promano`, `C61_psrafae`, `C62_confede`

**Planos de Edificación** (`.../pepch/planos/edificacion/`):
`E12_olleria`, `E13_marrubi`, `E21_tejares`, `E22_santama`, `E23_sanlore`, `E31_grancap`,
`E32_ayuntamiento`, `E33_magdale`, `E41_trinida`, `E42_calleferia`, `E43_santiag`, `E51_alcazar`,
`E52_promano`, `E61_psrafae`, `E62_confede`

All 30 files (15 + 15; the counts above are 15 not 14 because the district list has 15 entries in
practice — one more than the founder's screenshot summary suggested) were fetched with HTTP 200 and
saved to the corpus (§7). District-code prefixes (`C1x`/`E1x`, `C2x`/`E2x`, …, `C6x`/`E6x`) look
like a coarse geographic quadrant scheme (NW→SE across the historic centre), not sheet sequence
numbers — this explains why the founder's "sequential sheet number" guess (G01…G80) failed
everywhere except the one coincidental match.

**No separate index/legend PDF was found** alongside the plan series (the page itself carries no
legend text — see §1.1 result of the `WebFetch` against it, "No explicit legend codes for
protection levels appear on this index page itself").

---

## 2. Is `G32ayuntamiento.pdf` (the founder's AR/Gestión file) genuinely vector?

Yes — but it is nearly textless. `pdftotext -layout` on the file extracts exactly:

```
AR.CH. A1
```

One string, for the whole A4-size sheet. `pikepdf` confirms one embedded subset font
(`FBKHOF+Swiss721BT-Black`), no `/OCProperties` (no named CAD layers survived into the PDF export).
This is fully consistent with the founder's read of the screenshot: this file is the **Áreas de
Reparto / Gestión (management/redistribution)** overlay, carrying only the AR code for the tile
(`AR.CH.A1` = Área de Reparto, Casco Histórico, subzone A1) — a real code, but the wrong one. It is
**not** the ordinance/calificación subzone code needed for envelope computation.

---

## 3. Is the "C" series (Calificación y Gestión) the answer? — No, it's sparse

`C32ayuntamiento.pdf` (legacy mirror) and the canonical `C32_ayuntamiento.pdf` are the same
content (562,353 bytes, byte-identical download size). `pdftotext -layout` extracts **35 lines**,
not one — genuinely more text than the AR file — but `pdfminer` bounding-box positions show why
that's still not what's needed:

- ~24 distinct short labels scattered across the whole 842×595pt page: `H13`, `AV3`, `AV4`, `AV8`,
  `AV10`, `AV12`, `AV13`, `AA5`, `au1`, `AU6(pa4)`, `pa1`, `U14`, `s6`, `a3`, `u4`, `A1`, `H1`, and
  six bare letters `E`, `A`, `D`, `P` appearing 2–3 times each at different points on the page.
- One tight vertical cluster at the bottom of the page — `bbox x=223.0, y=36.7–65.1` — reading
  `E / H / D / C / P / A`, six single letters stacked in a ~28pt-tall column. This is almost
  certainly a **printed legend key**, not six more data points; its bbox height (~28pt for 6 rows)
  is too small for six independent map annotations to coexist without overlapping.

This matches the founder's screenshot description: "Áreas de Reparto (AR) / Gestión" plus scattered
"Espacios catalogados" (E) / "Hitos urbanos catalogados" (H) markers and delimited Áreas de
Vinculación (AV) / Actuación Unitaria (AU) / Ámbito de Actuación (AA) zones. These mark **specific
catalogued points and special delimited areas**, not a blanket per-parcel classification — most
ordinary (non-catalogued) parcels in the tile get **no code at all** on this sheet. **This sheet
does not solve the missing-subzone problem for the bulk of Casco Histórico parcels.**

---

## 4. The Edificación ("E") series — the actual find

### 4.1 Genuinely vector, and dense

`E32_ayuntamiento.pdf` (476,724 bytes) extracts **221 distinct text items** via `pdfminer`, each
a short label of the form `CODE NUMBER` (e.g. `CC 16`, `EA 62`, `EV 79`, `MA 7`, `MV 35`), each at
its own (x, y) position spread across the full page — i.e. genuinely one label per building
footprint, not a legend cluster. Sample (verified with real bounding boxes, not estimated):

```
'MV 35\n' (143.5, 553.2, 151.8, 555.7)
'EV 79\n'  (176.8, 550.9, 184.5, 553.4)
'CC 14\n'  (405.2, 554.4, 413.2, 556.9)
'EA 62\n'  (420.8, 549.0, 428.5, 551.5)
... [221 total, one per building footprint on this tile]
```

### 4.2 Code vocabulary, counted across all 15 Edificación sheets

```
E12_olleria.pdf     {'MA': 1, 'MV': 1, 'MC': 1}
E13_marrubi.pdf     {'MC': 3, 'MA': 1, 'MV': 1}
E21_tejares.pdf     {'EV': 3, 'CC': 9, 'MV': 1}
E22_santama.pdf     {}                              ← no matches this sheet (see caveat below)
E23_sanlore.pdf     {'EA': 34, 'CC': 27, 'MC': 3, 'MA': 3, 'MV': 1}
E31_grancap.pdf     {'EV': 24, 'MV': 8, 'CC': 25}
E32_ayuntamiento.pdf {'MV': 15, 'EV': 24, 'CC': 107, 'EA': 52, 'MA': 17}
E33_magdale.pdf     {'CC': 35, 'MC': 2, 'EA': 33, 'MA': 3, 'MV': 1}
E41_trinida.pdf     {'CC': 62, 'MV': 26, 'EV': 112, 'MC': 2}
E42_calleferia.pdf  {'EV': 73, 'MV': 21, 'CC': 129, 'EA': 87, 'MA': 15}
E43_santiag.pdf     {'CC': 17, 'EA': 25, 'MA': 9, 'MC': 2, 'MV': 1}
E51_alcazar.pdf     {'CC': 17, 'EV': 26, 'MV': 17, 'MC': 4}
E52_promano.pdf     {'EV': 8, 'CC': 8, 'MV': 6}
E61_psrafae.pdf     {'CC': 6, 'EV': 1, 'MC': 3, 'MV': 6}
E62_confede.pdf     {'MV': 2}

TOTAL: {'MA': 49, 'MV': 107, 'MC': 20, 'EV': 271, 'CC': 442, 'EA': 231}
```

Six distinct codes appear (`MC`, `CC`, `EA`, `EV`, `MA`, `MV`), each recurring dozens to hundreds of
times — a real, repeated, structured vocabulary, not incidental text. `MC`'s low count (20 total,
the rarest) is consistent with it marking individually-listed *Monumentos Catalogados* (there are
few true monuments); `CC`'s high count (442, the most common) is consistent with *Conjuntos
Catalogados* (protected ensembles are the majority classification in a historic core).
`E22_santama.pdf` returning zero matches is a **known caveat**, not investigated further this
session — either that tile genuinely has no catalogued/protected buildings (unlikely for a
historic-centre district) or the regex/extraction missed a formatting variant on that one sheet;
flag before relying on it.

### 4.3 Cross-check against the PEPCH normativa text (independent confirmation, not inference from the sheet alone)

Fetched and text-extracted `2021-6-PEPCH-NORMATIVA_innovaciones_aclaraciones.pdf` (Colegio Oficial
de Arquitectos de Córdoba's informative-purposes consolidated text, 2,802 lines,
`docs/.../corpus/CH-DWF/reference/PEPCH-NORMATIVA-coacordoba-2021.pdf`). Its table of contents
gives the three ordinance regimes that structure the whole plan:

```
TITULO II. NORMAS DE EDIFICACION
  Capítulo III  Ordenanza de Monumentos, Edificios y Conjuntos Catalogados   p.25
  Capítulo IV   Ordenanza de Protección Tipológica                          p.30
  Capítulo V    Ordenanza de Zona Renovada                                  p.37
```

And, decisively, Artículo 43 and Artículo 49 state in plain text (not inferred):

> *"Las parcelas calificadas de protección tipológica se identifican en el plano de edificación
> (ES)."* — parcels classified as "protección tipológica" are identified **on the Edificación
> plan**.

> *"El número máximo de plantas autorizable es el que se recoge para cada parcela en el plano de
> edificación (ES). Con carácter de mínimo obligatorio se permite una planta menos del máximo."*
> — the maximum authorised number of floors **for each parcel** is recorded on the Edificación
> plan, with a fixed table given immediately after (PB: 4.50 m / PB+1: 8.00 m / PB+2: 11.00 m /
> PB+3: 14.00 m).

This independently confirms — from the ordinance's own text, not from eyeballing the plan — that
the Edificación (`E##`) plan is the PEPCH's designated, authoritative carrier of **(a)** per-parcel
protection/ordinance classification and **(b)** per-parcel maximum floor count. That is precisely
the missing piece: the Casco Histórico equivalent of the CUS raster's unreadable MC-2/MC-3 digit.

### 4.4 What is NOT yet confirmed (do not overclaim)

- The literal expansion of `MC`/`CC`/`EA`/`EV`/`MA`/`MV` was not found spelled out verbatim in any
  fetched document. The mapping above is a reasoned inference (chapter structure + frequency
  pattern + `E_`/`M_` pairing), **not a confirmed lookup**. Before this is used for real envelope
  computation, the Anexo II "Catálogo de Bienes Protegidos" (linked from the same gmucordoba.es
  section, not yet fetched this session) should be pulled and cross-referenced — the catalogue
  entries likely list buildings by the same numeric ID seen after each code (e.g. the `16` in
  `CC 16`), which would let us confirm the code meaning by triangulation.
- The per-parcel **floor count** promised by Artículo 49 was not located as extractable text in
  this pass — the numbers following each code (1–254) are far too large and irregular to be floor
  counts (historic-centre buildings cap out around PB+3). They read as catalogue/building
  reference IDs. The actual floor-count value per parcel may require: (a) a second numeral cluster
  not yet isolated, (b) a distinct visual encoding (hatch/colour) rather than text, or (c) a join
  against the Anexo II catalogue by the reference ID. **This is the next concrete step**, not a
  closed question.
- Colour/fill information (which would show delimited-area boundaries, e.g. for Zona Renovada) was
  not extracted this session — only text objects were inspected. `pikepdf` confirms a `/ColorSpace`
  resource exists on both C and E series pages but its contents were not decoded.
- Only district 32 (Ayuntamiento) was inspected at word-position depth (§4.1); the other 14
  sheets were only checked for code vocabulary (§4.2), not verified for the same one-label-per-
  building density pattern.

---

## 5. Was this raster-in-PDF or genuinely vector? — Genuinely vector, on both series

This was the single most important technical question and it was **tested, not assumed**:

- `pdftotext` on both `G32ayuntamiento.pdf` and `C32/E32ayuntamiento.pdf` returns real, clean ASCII
  text strings (not OCR garbage, not empty) — impossible on a raster-wrapped-in-PDF file, where
  `pdftotext` returns nothing.
- `pikepdf` confirms each page's `/Resources` dict has a `/Font` entry with an embedded TrueType
  subset (`Swiss721BT-Black`), which is how CAD/DWF-to-PDF export normally embeds vector label
  text; there is no `/XObject` `/Image` filling the page.
- File sizes are small (98 KB – 643 KB for A3/A4-ish sheets) — consistent with vector path data,
  not a several-megapixel scan.

**Conclusion: this document family is genuinely vector, not scanned raster wrapped in a PDF
shell.** That part of the founder's hypothesis is confirmed outright.

---

## 6. Direct answers to the task's specific questions

| Question | Answer |
|---|---|
| Q2: Does the PEPCH series carry the actual ordinance/protection code per parcel (vs. just Gestión)? | **The Edificación (`E##`) series does; the Calificación y Gestión (`C##`) series does not** — it only marks catalogued points and delimited special areas, not blanket per-parcel classification. |
| Q3: Genuinely vector or raster-in-PDF? | **Genuinely vector**, confirmed by real text extraction + embedded font + no page-filling image, on all series checked. |
| Q4: Is the CH parcel's protection category present as extractable text? | **Yes, on the Edificación sheets** — one `CODE NUMBER` label per building footprint, 6-code vocabulary, hundreds of instances per sheet. **Not yet decoded to full legal names**, and the accompanying number is a catalogue ID, not (yet confirmed as) the floor count the ordinance says is also on this plan. |

---

## 7. Corpus saved

```
docs/04-reference/jurisdictions/es/es-an/14021-cordoba/corpus/CH-DWF/
  MANIFEST.md                          — this section, machine-checkable
  legacy_dwf_ch/
    G32ayuntamiento.pdf                 — AR/Gestión overlay, founder's original find
    C32ayuntamiento.pdf                 — stale mirror of canonical C32_ayuntamiento.pdf
  pepch_caliyges/
    C12_olleria.pdf ... C62_confede.pdf — 15 files, canonical Calificación y Gestión series
  pepch_edificacion/
    E12_olleria.pdf ... E62_confede.pdf — 15 files, canonical Edificación series (the find)
  reference/
    PEPCH-NORMATIVA-coacordoba-2021.pdf — consolidated ordinance text (COACo, informative)
```

---

## 8. Recommended next steps (not executed this session — investigation only)

1. Fetch `Anexo II. Catálogo de Bienes Protegidos` (linked from `gmucordoba.es/anexo-ii-catalogo-de-bienes-protegidos`)
   and attempt to join its building IDs against the numeric suffix seen after each code on the
   Edificación sheets (e.g. the `16` in `CC 16`) — this would let the 6-code vocabulary be
   confirmed by an independent legend rather than inferred from chapter structure.
2. Re-run the `pdfminer` extraction over all 15 Edificación sheets at full word-position depth
   (only district 32 was done this session) and check `E22_santama.pdf`'s zero-match result —
   confirm whether that tile is truly free of catalogued buildings or whether the extraction missed
   a formatting variant.
3. Decode the `/ColorSpace` fill data on both series to check whether Zona Renovada / Área de
   Vinculación boundaries are colour-coded distinctly from the text-label classification — this
   would let boundary geometry (not just point labels) be recovered per parcel.
4. Locate where (if anywhere) the per-parcel maximum floor count promised by Artículo 49 is encoded
   — this is the actual height number needed for envelope computation and was not found in this
   pass.
