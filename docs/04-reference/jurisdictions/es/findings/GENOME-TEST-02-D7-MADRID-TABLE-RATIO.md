# GENOME TEST 02 — D7: are Madrid's planning parameters in TABLES or PROSE?

> **ANSWER: PROSE. Overwhelmingly. `tableRatio = 0.000`.**
>
> In Título 8 (*Condiciones particulares del suelo urbano*), **385 of 385** numeric planning-parameter
> statements are in running prose and **0** are in tables.
>
> **Do not build the table extractor first.** The German-style born-digital text path is the correct
> priority for Madrid, and it is a better fit than anyone expected — see §3.
>
> Filed at **country level**, not under `es-md/28079-madrid/`, because it answers a Spain-wide
> architecture question (which extractor to build) and because the Madrid city directory is owned by
> another workstream.

---

## 0 — Why this was worth measuring

Founder discovery **D7** calls this *"probably the single most important research question"*:

> *"If `70% of rules → tables`, then legal compilation becomes much easier, because table extraction
> accuracy is dramatically higher than free-text extraction. One of the first things I would measure
> across cities is exactly this ratio."*

Capture note **G-13** agreed and sharpened it: the answer **changes what to build**. If ~70 % of the
NNUU parameters live in tables, the priority is a table extractor — scored **0 % capability** in the
national-compiler matrix. If they live in prose, the born-digital text path already shipped for
Germany transfers directly and table work is a minor add-on.

Sevilla batch 18a's confidence ladder independently puts **table extraction (95) above free text (80)**,
so the stakes are accuracy as well as effort.

---

## 1 — The document

| Property | Value |
| -------- | ----- |
| URL | `https://geoportal.madrid.es/fsdescargas/IDEAM_WBGEOPORTAL/ESTATICOS_VISORES_URBANISTICOS/PG97/TEXTOS/COMPENDIO_MPG_NNUU_07_07_2025.pdf` |
| HTTP | **200**, `application/pdf`, **26 318 633 bytes** |
| Pages | **628** |
| PDF version | 1.5 · `Language: es-ES` |
| Creator / Producer | **Power PDF Create** |
| Embedded `Title` | **`COMPENDIO MPG NNUU (07-07-2025)`** |
| `CreationDate` | **`D:20250704115335+02'00'`** — 4 July 2025, 11:53 CEST |
| `ModDate` | `D:20250704120122+02'00'` — 4 July 2025, 12:01 CEST |
| Author | `Alvaro Bermejo, Maria` |
| Running header on every page | **`EDICIÓN 7 DE JULIO DE 2025`** |
| Page footer on every page | *"Documento de carácter informativo. La versión oficial del texto y sus modificaciones se ha publicado en el BOCM"* |

### 1.1 — Born-digital, not scanned ✅

**11 of 628 pages (1.8 %) yield no extractable text**; the other 617 are fully extractable vector text.
Pages `2, 4, 6, 28, 173, 465, 466, 474, 476, 480, 534` — front matter and graphic annex plates.

**No OCR is required for the normative text.** This is the single most favourable fact in the report:
Madrid's ordinance is in exactly the shape the German `packages/ordinance-extraction/` born-digital
path was built for.

### 1.2 — The consolidation-date conflict (C-6) — **partially resolved**

Three candidate dates were in play (2023 / 2025-07-07 / 2025-09-24). For **this file**, three
independent internal signals agree:

- embedded `Title` = `COMPENDIO MPG NNUU (07-07-2025)`
- running header on all 628 pages = `EDICIÓN 7 DE JULIO DE 2025`
- `CreationDate` = 2025-07-04 (three days before the stated edition date — consistent with
  typesetting ahead of an edition date)

**So the "2023" candidate is dead** for this document, and **2025-07-07 is confirmed as this file's
edition date from inside the file**, not inferred from its filename.

**What is NOT resolved, stated plainly:** whether a *later* consolidation exists behind the
madrid.es publication page the corpus records as `Compendio-2025-…-actualizado-a-24-09-2025`. That URL
is not in the captured material, so it was not fetched, and **no conclusion about it is drawn here.**
C-6 requires fetching that page and comparing. Until then:

> **Cite Madrid parameters as `PGOUM-97, Compendio, edición 7 de julio de 2025`** — traceable to the
> document's own header — and treat "is there a September 2025 edition?" as an open item.

Also worth stamping on every citation: the document itself says it is **informational**, and that the
official text is the one published in the **BOCM**. Any legal-grade citation should reference the BOCM
publication, with the Compendio as the working copy.

---

## 2 — The measurement

Tool: [`tools/spanish-genome-probe/pdfTableRatio.ts`](../../../../../tools/spanish-genome-probe/pdfTableRatio.ts)
(+ `pdfInspect.ts` for verification).

**Method, so the number can be argued with:**
1. Text extracted per page via pdf.js, retaining each item's x / y / width.
2. Items grouped into **lines** by rounded y (1 pt jitter tolerance).
3. A line is **tabular** if it has **≥ 3** items separated by x-gaps **> 14 pt** — i.e. it looks like a
   row with columns.
4. A **table region** is **≥ 3 consecutive** tabular lines. One wide-spaced line (a heading with a page
   number) is *not* a table.
5. A **parameter hit** is a line matching a Spanish planning-parameter term **and** containing a
   number. Each hit is attributed to `table` or `prose`.

### 2.1 — Título 8 (the target), PDF pages 366–467

`CAPÍTULO 8.0` … `CAPÍTULO 8.11`, ending at `DISPOSICIONES ADICIONALES`.

| Metric | Value |
| ------ | ----: |
| Lines | 3 967 |
| Tabular lines | **47 (1.2 %)** |
| **Parameter hits — total** | **385** |
| **… in tables** | **0** |
| **… in prose** | **385** |
| **`tableRatio`** | **0.000** |

| Parameter | Prose | Table |
| --------- | ----: | ----: |
| setback (*retranqueo / separación / linderos*) | 83 | 0 |
| height (*altura / cornisa*) | 82 | 0 |
| floors (*plantas*) | 69 | 0 |
| depth (*fondo edificable / profundidad*) | 36 | 0 |
| FAR (*edificabilidad / coeficiente*) | 34 | 0 |
| coverage (*ocupación*) | 25 | 0 |
| alignment (*alineación*) | 24 | 0 |
| minimum plot (*parcela mínima*) | 24 | 0 |
| patio | 6 | 0 |
| frontage | 2 | 0 |

### 2.2 — Whole document (628 pages), for context

795 parameter hits — **0 in tables, 795 in prose**. 261 tabular lines of 23 390 (**1.1 %**);
23 table regions across 27 pages (**4.3 % of pages**).

### 2.3 — The detector is not blind — verified

A "0 %" result is only meaningful if the table detector can find tables at all. It can:

- **p.298** — `TABLA 1. ESTÁNDARES DE DOTACIÓN DE PLAZAS DE APARCAMIENTO`, 42 tabular rows, correctly
  segmented into 3–6 columns (`Taller aut. 1/100 m 1/100 m 2/100 m 1.5/100 m 3/100 m`).
- **p.132** — the APE colony register, 29 rows of `nº | name | APE code`.
- **p.461** — 26 rows.

So Madrid's Compendio **does** contain tables. **They are parking standards, APE/APR registers and
area-of-reparto lists — not zone parameter tables.** The 47 "tabular" lines inside Título 8 are
false positives: bulleted street lists in `CAPÍTULO 8.10 EJES TERCIARIOS` whose wide leader spacing
mimics columns (`• Bravo Murillo   Conde de Serrallo-Glorieta de Cuatro Caminos.`).

**The conservative reading strengthens the result:** correcting those false positives moves the ratio
further toward zero, not away from it.

---

## 3 — The finding that matters more than the ratio

Madrid's parameters are prose, but they are **extraordinarily templated prose**, and they carry a
built-in checksum. Verbatim:

```
4. La altura máxima total será de cuatrocientos cincuenta (450) centímetros.
5. La altura máxima será de setecientos cincuenta (750) centímetros y un máximo de dos …
3. La altura máxima de la edificación será de seis y medio (6,50) metros y dos (2) plantas.
2. En los grados 2º, 4º y 6º la ocupación máxima será el setenta y cinco por ciento (75%) …
c) La ocupación máxima de la edificación será inferior o igual al siete por ciento (7%)
4. La ocupación máxima de suelo por los usos compatibles, será del diez por ciento (10%).
```

Two properties, both exploitable:

1. **`<PARAMETER> máxima … será de <NUMBER> <UNIT>` is a grammar, not a language.** This is founder
   **D4** (*"the law repeats itself… almost templates… NLP on repeated legal phrases, not general
   language understanding"*) confirmed by measurement. A deterministic grammar — founder §39's
   *"compiler front-end, not an LLM"* — is the right tool.
2. **Every number is written TWICE — spelled out AND in parenthesised digits.** `cuatrocientos
   cincuenta (450)`, `setenta y cinco por ciento (75%)`, `seis y medio (6,50)`. This is Spanish legal
   drafting convention and it is a **gift**:
   - the parenthesised digit form is an unambiguous, high-precision anchor;
   - the spelled-out form is a **free validator** — parse both, and disagreement is a hard extraction
     error rather than a silent wrong number.

That second property directly serves H4's *"0 inferred numeric values"* target and this repo's
standing discipline (L-616: never emit a confident-wrong number). **A word-form/digit-form
cross-check should be a required invariant of the Spanish extractor**, not an optimisation.

---

## 4 — Corrections to the corpus (incidental, but load-bearing)

Reading the actual document contradicts two things the captures assert:

1. **The chapter map is wrong.** Batch 3b §3 lists Título VIII as chapters `8.1 … 8.8` = Norma Zonal
   1–8. The document actually runs **8.0 to 8.11**:

   | Chapter | Actual heading |
   | ------- | -------------- |
   | 8.0 | PRELIMINAR |
   | 8.1 | ZONA 1. Protección del patrimonio |
   | 8.2 | **ZONA 2. Protección de las colonias** |
   | 8.3 | ZONA 3: Volumetría específica |
   | 8.4 | ZONA 4: Edificación en manzana |
   | 8.5 | ZONA 5: Edificación en bloques |
   | 8.6 | **ZONA 6. Edificación en cascos** |
   | 8.7 | **Edificación en baja densidad** (not "Zona 7") |
   | 8.8 | ZONA 8: Edificación en vivienda |
   | 8.9 | **ZONA 9: Actividades económicas** |
   | 8.10 | **Ejes terciarios** (not a Norma Zonal) |
   | 8.11 | **Remodelación** |

   **This closes C-5 / C-9.** Zones **2, 6 and 9 are legally real** and have their own chapters —
   their absence from `AMB_TX_ETIQ` is a GIS-vocabulary question, not "these zones don't exist".
   Zones **10 and 11 do not exist**: the chapter list ends at 8.11, and 8.11 is *Remodelación*, not a
   zone. That question can now be closed.

   Note also that **8.10 Ejes Terciarios overrides the zonal use regime** (*"prevaleciendo, en cuanto
   al régimen de usos, sobre las condiciones particulares de la norma zonal correspondiente"*) — a
   street-indexed override the ontology does not currently model.

2. **The document numbers its titles in ARABIC, not Roman.** It is `TÍTULO 8`, never `TÍTULO VIII`.
   A search for "Título VIII" returns **zero matches in 628 pages**. Every capture in the corpus uses
   the Roman form. Harmless for humans; **fatal for a section-locating parser**, and worth fixing in
   the captures before anyone codes against them.

---

## 5 — What to build, and what not to

| Priority | Item | Justification |
| :------: | ---- | ------------- |
| **1** | **Reuse the German born-digital text path** with a Spanish grammar + a `TÍTULO 8` chapter classifier | 617/628 pages are extractable text; 385/385 parameters are prose. Capture note **C-11** proposed exactly this as a hypothesis — it is now measured and supported. |
| **2** | **A word-form ↔ digit-form cross-validator** | Free, and it converts H4's "0 inferred values" from an aspiration into a check. |
| **3** | Article-path citation binder (`Artículo 8.10.2 (N-2)` is right there in the text) | Article numbering is explicit, inline and machine-parseable. |
| **not now** | **The table extractor** (0 % capability in the matrix, targeted at >95 %) | It would buy **0 of 385** Título 8 parameters. It is needed only for parking standards (Título 7) and APE registers. |

**The founder's own instinct to measure this first was right, and the measurement inverted the
answer.** The "0 % → >95 % automatic table extraction" row — flagged in **G-8** as the most
consequential in the capability matrix — is, for Madrid's zone parameters, **not on the critical path at all.**

### 5.1 — Scope caveat

`n = 1 document, 1 city`. D7 asks for this ratio **across cities**. València's PGOU has not been
measured — and per [`GENOME-TEST-01`](./GENOME-TEST-01-MADRID-TO-VALENCIA.md), València has **109
base zone codes vs Madrid's ~7**, so a 109-zone ordinance may well use tables where a 9-zone one uses
prose. **Run this same tool against the València PGOU before generalising**; it now costs one command.

---

*Measured 2026-07-31 against the live PDF (SHA of the response not retained; re-fetch is deterministic
from the URL in §1). Tooling: `tools/spanish-genome-probe/pdfTableRatio.ts`, `pdfInspect.ts`.
The 26 MB PDF is deliberately NOT committed.*
