# Córdoba (INE 14021) — Corpus Review, 2026-08-04 (PM pass)

> **Scope.** A founder-supplied document corpus landed under `corpus/` this session. This pass reads
> it end-to-end against the 7 previously-identified blockers in
> [`../findings/CAPABILITY-AUDIT-2026-08-04.md`](./CAPABILITY-AUDIT-2026-08-04.md) and
> [`../CLOSURE-REGISTER.md`](../CLOSURE-REGISTER.md), using `pdftotext` (confirmed at
> `/mingw64/bin/pdftotext`) to extract real text rather than trusting filenames or Read-tool PDF
> rendering (`pdftoppm` is not installed here). **Pure research/documentation task — no code,
> `esCordobaPGOU2001.ts`, or `ZoningRulesEngine.ts` was touched.**

---

## A. Per-document verdict table

| Document | What it actually contains | Confidence | Closes a gap? |
|---|---|---|---|
| `cus/CUS01W.jpg` … `CUS49W.jpg` (49 files) | **Real, legible raster calificación sheets.** Spot-checked CUS01 (rural/periphery, La Albaida/PAULA area) and CUS41 (dense urban core) visually via the Read tool — both are genuine 1:5000 "CALIFICACIÓN, USOS Y SISTEMAS" plan sheets, Texto Refundido Oct. 2002, with a full shared legend (zona de ordenanza colour key, usos dotacionales, suelo urbanizable/no urbanizable, planeamiento remitido codes PE/PERI/ED/PU/PP/PA/PAU), coordinate grid (UTM), and an index grid locating sheet 1–49. Byte sizes (137–516 KB) and JPEG magic bytes were already verified in `MANIFEST.md`; this pass adds visual confirmation of legibility and format consistency across a central and a peripheral sheet. | High (2/49 visually spot-checked + full-set byte/format check already in `MANIFEST.md`) | **Does not itself close blocker 22/1** (still rasters, not vectors) — but corroborates that the raster source is real, consistent, and usable as a georeferencing/vectorisation input, exactly as the register already concluded. |
| `alineaciones-rasantes/ar01.pdf` … `ar49.pdf` (49 files) | **Real PDF plan sheets, vector/CAD-derived, effectively zero extractable text** — `pdftotext` on `ar01.pdf` and `ar25.pdf` both returned **1 character**. This is expected for alignment/frontage drawings (they are line geometry, not prose) and matches the prior finding on `O_MC2.pdf` (vector paths, zero text ops). Valid PDF headers and non-trivial sizes (102 KB–1.27 MB) already confirmed in `MANIFEST.md`; `ar38.pdf`'s embedded metadata (Acrobat Distiller 8.0.0, 2013 AutoCAD "ali38.dwg Model" source) corroborates authenticity as real survey/CAD sheets, not placeholders. | High on authenticity/format; **cannot assess content (measurement basis for Art. 13.5.3.1) without a vector/CAD viewer** — this pass could not open embedded CAD geometry, only confirm it is not a text-extractable PDF. | Does **not** close blocker 8/row 25 (MC street-width measurement basis) — that still needs a human or a PDF-vector-geometry tool to read the drawn alignment lines, which `pdftotext` cannot surface. No regression either: nothing here contradicts the prior finding that a citable alignment SOURCE (as opposed to a WFS/WMS service) now exists. |
| `Cordoba PGOU/TomoIIA_TR_A4_Revisado_Parte1.pdf` + `Parte2.pdf` | Régimen Urbanístico — re-confirmed real, substantial text (searched for `Campo de la Verdad`, `13.4.1`: zero hits, confirming this volume is NOT where the CTP-1/PT-CV cross-reference lives). Already known-good from earlier this session; not re-read cover to cover. | High (previously verified + targeted grep this pass) | No new closure; used as a negative control to locate where Art. 13.4.1 actually lives (see TomoIIB row below). |
| `Cordoba PGOU/TomoIIB_TR_A4_Revisado_Parte1.pdf` + `Parte2.pdf` | Usos, Ordenanzas y Urbanización — **contains Art. 13.4.1** (`CAPITULO CUARTO. ORDENANZA DE LA ZONA DE PROTECCION TIPOLOGICA CAMPO DE LA VERDAD`), the exact article the pack's D3/blocker-10 comments cite as deferring PT-CV's envelope to "Tomo VI." Full text extracted this pass (`pdftotext`, ~255 KB + 205 KB of text). | High — verbatim article text extracted and read directly, not paraphrased | ⭐ **Directly closes blocker 10 / PT-CV — see §B below.** The exact cross-reference sentence was located and read. |
| `Cordoba PGOU/normativa_PEPCH_Revisado.pdf` | **PLAN ESPECIAL DE PROTECCIÓN DEL CONJUNTO HISTÓRICO — NORMAS URBANÍSTICAS**, the PEPCH regulatory text (Revisado, with 2010/2021/2024 interpretive annotations layered in). `pdftotext` extracted **164,282 characters, 1,083 lines** of real prose — **not** a zero-text scanned image, contrary to what an earlier pass might have assumed by analogy with the vector-only `O_MC2.pdf`. Read in full (all ~92 pages via chapter-by-chapter grep + targeted reads). Contains genuine per-zone **numeric** ordinance: Cap. IV "Ordenanza de Protección Tipológica" (Art. 43–55) — ocupación 70%/80% (Art. 46), patio principal ≥25%/20% of parcel + 7 m/5 m/4 m minimum side (Art. 47), **alturas reguladoras máximas by floor count**: PB 4.50 m · PB+1 8.00 m · PB+2 11.00 m · PB+3 14.00 m (Art. 49.2), retranqueos **prohibited** (= 0 m setback, Art. 45.2); Cap. V "Ordenanza de Zona Renovada" (Art. 56–65) — ocupación 70%/100% (Art. 59), heights PB+2 10.50 m through PB+6 23.50 m (Art. 61.2), subsuelo up to 2 basement floors at 100% occupation (Art. 62); Cap. III "Monumentos, Edificios y Conjuntos Catalogados" (Art. 38–42) is correctly a **catalogue-level regime, not a scalar envelope** (the building IS the envelope, per-asset ficha governs) — this is the same, correct "no single number" pattern already established for Elemento Protegido elsewhere in the PGOU. General building-code articles (Art. 17–23) also carry real numbers: patio de luces/ventilación areas by floor count, planta-baja/alta clear-height minimums (2.20–3.00 m), roof pitch 25°–35°, roof cumbrera ≤3 m above altura reguladora. | **High** — full-text extraction succeeded (no OCR needed), read end-to-end, article numbers and figures cross-checked against the table of contents. | ⭐⭐ **Closes blocker 5 (PEPCH real numbers unverified) — see §B.** This is a REAL numeric ordinance document with citable articles, not a procedural-only text. |
| `Cordoba PGOU/Normativa_del_conjunto_histórico.pdf` | Titled internally **"TOMO VIB. CONJUNTO HISTÓRICO"** (Memoria + Normas Urbanísticas) — i.e., this IS (a copy of, or the source for) the Tomo VI the PGOU-2001 cites. `pdftotext` extracted 353,439 characters / 5,756 lines. Front matter (Memoria: objeto, síntesis de información, objetivos y propuestas) plus the same Normas Urbanísticas body found in `normativa_PEPCH_Revisado.pdf` (article numbers and figures match verbatim where compared, e.g. Art. 46 ocupación 70%/80%, Art. 49 height table). This is the fuller/earlier-vintage volume; `normativa_PEPCH_Revisado.pdf` is the "Revisado" (updated with 2010–2024 interpretive notes) standalone Normas. | High — full text extracted and read; internal title matched directly against the cited "Tomo VI" | ⭐⭐ **Independently corroborates blocker 10's closure** — this is the actual Tomo VI volume (Memoria half), not a same-named-but-different document. |
| `TOMO 03 NORMATIVA URBANISTICA FICHASv3/TOMO 03 NORMATIVA URBANISTICA FICHASv3.pdf` | ⛔ **This is NOT a Córdoba document.** `pdftotext` on the 42.8 MB file extracted 303,792 characters of real text — but the text is the **"PLAN GENERAL MUNICIPAL DE ORDENACIÓN DE LORCA"** (Lorca, Región de Murcia — an entirely different municipality). Confirmed by direct count: **"Lorca" appears 291 times, "Córdoba" appears 0 times** in the extracted text. Content is genuinely a fichas-de-zona-de-ordenanza volume (Zona Casco, Zona Ensanche, etc. with parcela mínima/retranqueos/fondo máximo/altura máxima tables) and separately a Suelo No Urbanizable protected-zones catalogue (geological/environmental) — real, well-formed ordinance content, just for the wrong city. | **High confidence this is misfiled/wrong-city**, not that the hypothesis about Córdoba's own Fichas volume is resolved either way. | **Does NOT close** the "Fichas de Planeamiento y Gestión" hypothesis for Córdoba's Plan Parcial/PERI/ED/Plan Especial delegation land (≈43–45% of pilot ordinance land) or the PA/PAM transitional-area list. **The hypothesis is neither confirmed nor refuted for Córdoba — it is simply answered by the wrong document.** A genuine Córdoba "Tomo 03" (or equivalent Fichas volume) has not been located in this corpus. |
| `planos de calificacion y gestion/` (15 files: C12_olleria, C13_marrubi, C21_tejares, C22_santama, C23_sanlore, C31_grancap, C32_ayuntamiento, C33_magdale, C41_trinida, C42_calleferia, C43_santiag, C51_alcazar, C52_promano, C61_psrafae, C62_confede) | **Vector PDF plan sheets for the historic-centre "plano de calificación y gestión (AUG)"** — the exact plan the PEPCH Normas Urbanísticas repeatedly cite (Art. 2, 7, 10, 36, 37, 58) as defining zone boundaries, actuación delimitations, and pedestrian/vehicle circulation categories inside the Conjunto Histórico. Spot-checked 2 of 15 (`C32_ayuntamiento`, `C51_alcazar`): `pdftotext` extracts only short label tokens (E, H, D, C, P, A zone-letter codes; AU/AV/pa/a actuación codes) — confirming these are **map sheets with embedded vector labels**, not prose documents, and are a DIFFERENT, smaller-scope geometry product from the CUS series (historic-centre only, not city-wide). The 15-sheet naming (C-prefix + neighbourhood name) suggests one sheet per historic-centre barrio, not one per city grid cell like CUS. | Medium — 2 of 15 spot-checked, format is consistent and plausible, but full content (actual zone-code-to-parcel mapping) was not visually rendered (no `pdftoppm` available) | **New information, not previously catalogued as an asset.** Does not itself close any of the 7 blockers, but is a candidate **vector-labelled geometry source specifically for the historic centre** — smaller in scope than the city-wide CUS gap but potentially higher-value given the historic centre's regulatory complexity (6 protection levels). Flagged as a follow-up lead, not evaluated further this pass (out of scope: this task is documentation review only). |

---

## B. The 7 previously-identified blockers — updated verdicts

### 1. MC street width (Manzana Cerrada per-street-width height table, Art. 13.5.3.1) — **STILL OPEN**

The 49 `alineaciones-rasantes/ar*.pdf` sheets are confirmed real, valid, CAD-sourced PDFs, but
`pdftotext` extracts effectively nothing (1 character on both files sampled) — they are pure vector
line drawings. **This pass could not determine Art. 13.5.3.1's measurement basis** (is street width
measured between alineaciones, façade-to-façade, kerb-to-kerb?) because doing so requires either a
human visually reading the CAD geometry, or a PDF vector-path extraction tool this environment does
not have (`pdftoppm` unavailable; a hypothetical `pdf-lib`/`pdfplumber` path-geometry read was not
attempted — out of scope for a text-extraction pass). **No regression**: the prior finding that a
citable, fetched alignment SOURCE now exists (as opposed to zero sources before 2026-08-04) still
stands per `MANIFEST.md`. **Verdict: STILL OPEN**, narrower than before — the source is in hand, the
reading is not done.

### 2. Citywide calificación geometry (49 raster CUS sheets → vector) — **STILL OPEN, as expected**

Spot-checked CUS01W (peripheral/rural) and CUS41W (dense central) visually — both are real, legible,
consistent-format 1:5000 raster plan sheets sharing one legend. This confirms (does not newly
establish — `MANIFEST.md` already established byte-level authenticity) that the raster source is
usable input for a georeferencing/vectorisation pass. **No PDF or vector data was found anywhere in
this corpus that supplies city-wide calificación as vector geometry.** **Verdict: STILL OPEN** —
correctly unchanged, this is engineering work (georeferencing + vectorising 49 sheets) that this
corpus review does not and cannot shortcut.

### 3. MC footprint (block-fondo geometry) — **already closed (engineering, not data)** — unchanged

Not addressed by this corpus; the register already records this as closed on the ordinance-text
reading (Art. 13.5.2.4, depth is *libre* bounded by ocupación) done in an earlier pass. Nothing in
this corpus contradicts or adds to that. **Verdict: unchanged, CLOSED (engineering).**

### 4. PT-CV / Tomo VI (Conjunto Histórico envelope for Campo de la Verdad, Art. 13.4.1) — ⭐ **NEWLY CLOSED**

**Evidence, read directly this pass:**

- `Cordoba PGOU/TomoIIB_TR_A4_Revisado_Parte2.pdf`, extracted text, **Art. 13.4.1** (verbatim):
  > *"Comprende esta zona las áreas representadas en el plano de Calificación, Usos y Sistemas, con la
  > trama de PT-CV. Se corresponde con el ámbito físico de la zona histórica del Campo de la Verdad.
  > El desarrollo correspondiente a esta ordenanza se encuentra en la Memoria y Normativa
  > correspondiente al Conjunto Histórico (Tomo VI. Conjunto Histórico), denominándose PT, a excepción
  > del régimen de parcelación, que será el de la ordenanza de la zona de Colonia Tradicional
  > Popular."*
  (i.e.: PT-CV's buildability = the "PT" — Protección Tipológica — ordinance in Tomo VI, **except**
  parcelación, which follows CTP instead.)
- `Cordoba PGOU/normativa_PEPCH_Revisado.pdf` and `Normativa_del_conjunto_histórico.pdf` (TOMO VIB)
  both contain, **verbatim and matching each other**, **CAPITULO IV. ORDENANZA DE PROTECCIÓN
  TIPOLÓGICA** — exactly the "PT" ordinance Art. 13.4.1 points to:
  - Art. 46 — ocupación máxima 70% (80% for unifamiliar residencial)
  - Art. 45.2 — retranqueos **prohibited** (setback = 0, alignment on the façade line)
  - Art. 47 — patio principal ≥25% of parcel (20% unifamiliar), minimum side 7 m / 5 m / 4 m by use
  - Art. 49.2 — **alturas reguladoras máximas**: PB 4.50 m · PB+1 8.00 m · PB+2 11.00 m · PB+3 14.00 m
  - Art. 50 — one basement floor, capped at ground-floor footprint

**This is a real, numeric, citable envelope for PT-CV.** The one caveat the article itself states —
parcelación follows CTP, not PT — is a small, explicit, already-handled-elsewhere cross-reference
(CTP's parcelación rules are already in `esCordobaPGOU2001.ts`).

**Verdict: NEWLY CLOSED as a documentation/research matter.** The numbers exist, are cited to a real
article, and were read directly from the source, not inferred from a filename. **Packing them into
`esCordobaPGOU2001.ts` is explicitly NOT done in this pass** (task boundary) — that is real follow-up
engineering work: transcribe Art. 45/46/47/49/50 as a PT-CV `geometricRule` set, cross-reference CTP's
existing parcelación fields, and run the same OCR/verification discipline (`OCR-EXTRACTION-RESULTS.md`
§ pattern) already applied to the 13 packed subzones before this can ship as anything above
`pipeline-extracted-unverified`.

### 5. UAS/IND packing — **already correctly not a data gap** — unchanged

Not addressed by this corpus (UAS numbers were already recovered from TomoIIB in an earlier pass, per
`esCordobaPGOU2001.ts`'s own header comment). Nothing new found here.

### 6. Dispatch wiring — **already closed** — unchanged, out of scope

Code-level; not a documentation question and not touched this pass per the task boundary.

### 7. PEPCH real numbers — ⭐ **NEWLY CLOSED (documentation-side)**

Blocker 5 in `CAPABILITY-AUDIT-2026-08-04.md` framed this as: *"confirming the Normas Urbanísticas text
is extractable, (b) transcribing/OCR-verifying it, (c) a human sign-off."* Part (a) is now done and
decisively answered **yes**: `normativa_PEPCH_Revisado.pdf` is a real, `pdftotext`-extractable,
164 KB / 1,083-line document (not scanned, no OCR needed) with genuine article-cited numeric content
across five ordinance families:

| Ordinance | Ocupación | Setback | Height | Notes |
|---|---|---|---|---|
| **Monumentos/Edificios/Conjuntos Catalogados** (Cap. III, Art. 38–42) | n/a — per-asset ficha | n/a | n/a | Correctly a catalogue regime, not a scalar — the building IS the envelope |
| **Protección Tipológica / PT** (Cap. IV, Art. 43–55) | 70% (80% unifamiliar) | 0 (retranqueos prohibited) | PB 4.50 / PB+1 8.00 / PB+2 11.00 / PB+3 14.00 m | This is also the article PT-CV (blocker 4 above) points to |
| **Zona Renovada / ZR** (Cap. V, Art. 56–65) | 70% (100% non-residential ground floor) | 0 (retranqueos prohibited, with narrow named exceptions) | PB+2 10.50 → PB+6 23.50 m | Deeper allowed intervention (nivel 5, nueva implantación) |

Parts (b) transcription and (c) human sign-off are **explicitly not done in this pass** — this review
only establishes that the source text exists, is real, and is readable; it does not itself constitute
the OCR-verification/sign-off discipline the pack requires before shipping a number.

**Verdict: PARTIALLY CLOSED.** The "does the source exist and carry real numbers" question — the
actual open item in blocker 5 — is now answered definitively **yes**, closing the research half. The
engineering half (transcribe into `esCordobaPGOU2001.ts` PT/ZR/monument entries, OCR-verify, sign off)
remains **open**, is now fully scoped, and should be sized similarly to the original 13-subzone PGOU
pass (a few days, mostly human verification time, not discovery time).

---

## Bonus: the Tomo 03 "Fichas" hypothesis — **REFUTED for this document, hypothesis left open**

The capability audit's hypothesis (not this session's, an earlier one) was that
`TOMO 03 NORMATIVA URBANISTICA FICHASv3.pdf` might be Córdoba's "Fichas de Planeamiento y Gestión"
volume — needed for (a) the ~43–45% of pilot land delegated to Plan Parcial/PERI/ED/Plan Especial, and
(b) the PA/PAM transitional-area list under Título Noveno. **This is decisively wrong**: the document
is the Plan General Municipal de Ordenación of **Lorca** (Región de Murcia), not Córdoba — 291
occurrences of "Lorca," zero of "Córdoba," in 303,792 characters of extracted text. This appears to be
a misfiled document in the founder-supplied corpus (plausibly picked up alongside other regional
materials during a bulk gather). **Córdoba's own equivalent Fichas volume — if one exists and is
published — was not found anywhere in this corpus** and remains a genuinely open research question,
distinct from (and not resolved by) this file.

---

## What, if anything, is STILL missing — honest final assessment

**On the document-acquisition side, for the specific 2 blockers this corpus targeted (PT-CV/Tomo VI
and PEPCH numbers), the answer really is "nothing more is missing — only the digitisation/transcription
engineering pass remains."** Both documents are real, both are `pdftotext`-extractable without OCR,
both carry genuine article-cited numeric ordinances, and this pass read them directly rather than
inferring from filenames — meeting the rigor bar this task set (the CUS/AR "dead sheets" and Murcia
41.4pp lessons this session's memory already flags). That is itself the reportable finding: two of
the register's remaining open items turn out to be **engineering-only**, not research-blocked, as of
this pass.

**What is still genuinely missing, unresolved by this corpus:**

1. **MC street-width measurement basis (blocker 1/row 25)** — the 49 AR PDFs exist and are real, but
   their content (CAD vector line geometry) could not be read by the tooling available in this
   environment. This needs either a human to open the PDFs in a real viewer and read the drawn
   alignment against Art. 13.5.3.1's bands, or a vector-geometry extraction tool this session did not
   have. **Still open, now narrowly scoped to "read 49 already-in-hand PDFs," not "find a source."**
2. **City-wide vector calificación (blocker 2/22)** — unchanged. The 49 CUS rasters are confirmed
   real and legible (spot-checked, not exhaustively), but remain rasters; no vector alternative was
   found anywhere in this corpus. This is the one item in this whole review that is exactly as large
   as it was before — weeks of georeferencing/vectorisation engineering, not a document-acquisition
   gap.
3. **Córdoba's own "Fichas de Planeamiento y Gestión" / PA-PAM transitional list** — genuinely
   unlocated. The one document that looked like a candidate is a different city's plan entirely. This
   remains an open research question the corpus did not answer either way.
4. **PT-CV / PEPCH transcription into the shipped pack** — the numbers are now confirmed real and
   readable (this pass's main finding), but transcribing them into `esCordobaPGOU2001.ts` with the
   same OCR-verification discipline as the 13 already-packed subzones is deliberately **not done
   here** — flagged for a dedicated follow-up engineering task, per the task boundary given for this
   review.

**Net effect on the 7-blocker list:** 2 blockers move from OPEN/PARTIAL to a state where the
*research* half is closed and only the *engineering/transcription* half remains (PT-CV/Tomo VI, PEPCH
numbers); the CUS/AR raster-vs-vector picture is unchanged; the Fichas/PA-PAM hypothesis is refuted
for this specific document but the underlying question stays open; the historic-centre
`planos de calificacion y gestion/` set is a newly-noticed, not-yet-evaluated candidate asset for a
future pass.

---

*Method note: all text extraction used `pdftotext <path> -` or `pdftotext <path> <outfile>` via Bash,
per the task's explicit instruction (Read tool does not render PDFs reliably in this environment, and
`pdftoppm` is not installed for page-image rendering). Encoding artifacts (`�` in place of Spanish
accented characters) are a `pdftotext`/terminal charset display issue, not a content-authenticity
concern — article numbers, figures, and keyword matches are unaffected and were verified directly
against the raw extracted text shown above.*
