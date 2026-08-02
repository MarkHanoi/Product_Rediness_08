# Madrid (INE 28079) — Canonical Legal Corpus · INDEX

> **Purpose.** One versioned index of the *published instruments* that govern buildability in
> Madrid, so that every rule pack cites **this index** instead of a URL, a scratchpad path, or a
> screenshot.
>
> **Status:** seeded 2026-08-01 (L-677). Modelled on
> [`../../../es-ct/08019-barcelona/corpus/INDEX.md`](../../../es-ct/08019-barcelona/corpus/INDEX.md).
>
> ⚠ **Madrid is now the SECOND Spanish city whose cited quotes can be re-read offline.** Córdoba and
> Murcia still hold ZERO primary sources (`799c3e49` / L-674); Murcia's own source portal returns
> HTTP 403 to automated requests, so its per-parameter quotes cannot currently be proved by anything
> in the repo. That gap was Madrid's too, until this file.

---

## 0. How to read this file

The same three orthogonal status fields Barcelona uses. **Do not collapse them.**

| `verificationStatus` | meaning |
|---|---|
| `binding-text-retrieved` | We hold the text **as published in the official gazette**. Citable. |
| `re-edition-only` | We hold a consolidation/compendium. Useful for navigation and for checking a transcription, **not** citable as the binding text. |
| `reference-only` | We only have proof the instrument exists. No text. |

`supersessionStatus` — per article: `superseded-by:<instrument>` / `no-later-instrument-found
(<register>, <date>)` / `not-checked`. ⚠ *not-located-in-source* ≠ *does-not-exist*.

---

## 1. Instruments

### 1.1 PG97 — Plan General de Ordenación Urbana de Madrid (1997)

```yaml
id: PGOUM-97
title: "Plan General de Ordenación Urbana de Madrid de 1997"
authority: "Ayuntamiento de Madrid / Comunidad de Madrid"
approvalDate: 1997-04-17          # CARRIED, ASSERTED — not re-verified from the BOCM (see §3)
articlesRelevantHere: "Título 8 (Normas Zonales 1–11), Título 6 Cap. 6.6 + Art. 6.3.5 (height datum)"
verificationStatus: re-edition-only
sourceHeld: "the Compendio 2025 consolidation below — `carácter informativo` by its own statement"
note: >
  The BOCM publications of PG97 and of each modificación puntual are the BINDING texts. None is
  held. Every Madrid citation in this dossier is therefore a citation to a consolidation, and the
  concordance check in §2 measures fidelity to THAT consolidation, never to the gazette.
```

### 1.2 COMPENDIO 2025 (24-09-2025) — ✅ **RETRIEVED, IN REPO**

```yaml
id: COMPENDIO-2025-09
title: >
  Compendio de las Normas Urbanísticas del Plan General de Ordenación Urbana de Madrid de 1997 —
  actualizado a 24 de septiembre de 2025
authority: "Área de Gobierno de Urbanismo, Medio Ambiente y Movilidad, Ayuntamiento de Madrid"
consolidatedTo: 2025-09-24
legalCharacter: >
  «Documento de carácter informativo. La versión oficial del texto y sus modificaciones se ha
  publicado en el BOCM» — printed on EVERY page of the document itself. ⇒ a signature on this
  document is a signature on a CONSOLIDATION, not on the law (VERIFICATION.md V3).
verificationStatus: re-edition-only
localFile:
  path: pdf/COMPENDIO_MPG_NNUU_24-09-2025_PGOUM-97.pdf
  bytes: 25735355
  pages: 626
  sha256: 1A3AA172B7ABE092F03E58FB2AFC26C87020B907887F919CEE20002E5FC4D0B5
  pdfMetadata:
    title: "COMPENDIO MPG NNUU (24-09-2025)"
    producer: "Power PDF Create"
    creationDate: "D:20251020112030+02'00'"
  coverPage1: "COMPENDIO SEPTIEMBRE 2025 … ACTUALIZADO A 24 DE SEPTIEMBRE 2025"
  textLayer: born-digital (extractable; NOT a scan — no raster pass needed, unlike DOGC 4893)
retrievalURL: >
  https://www.madrid.es/UnidadesDescentralizadas/UDCUrbanismo/PGOUM/CompendioNNUU/
  Compendio_2025_septiembre/COMPENDIO_MPG_NNUU_24_09_2025.pdf
retrievalStatus: "see RETRIEVAL-LOG.md — the URL is Akamai-blocked to automated GETs TODAY"
supersessionStatus:
  wholeDocument: "not-checked"
  note: >
    The document carries its own per-article amendment footnotes (e.g. Art. 8.8.9 → «modificado por
    la MPG 00/343, aprobación definitiva 08.11.2023 BOCM 27.11.2023»; Cap. 8.3 → «MPG 00/335,
    10.05.2016 BOCM 19.05.2016»). Those footnotes are now machine-readable in-repo, so the
    supersession audit CLOSURE-REGISTER row 14 asks for is newly tractable. It has NOT been done.
```

⚠ **THE EDITION MATTERS AND TWO ARE LIVE.** `geoportal.madrid.es` serves a **superseded 07-07-2025**
edition with no on-page signal; `transparencia.madrid.es` serves this **24-09-2025** one
(VERIFICATION.md V9/V10). The file held here is verified to be the **24-09-2025** edition by its own
PDF `title` metadata *and* its cover page — not by the URL it came from. **Treat any `07_07_2025`
quote as version-suspect.**

---

## 2. Fidelity of the extraction to this document — §MADRID-QUOTE-CONCORDANCE

`tools/madrid-extract/` produced **282 cited records** across `../extracted/*.json`, carrying
**1,321 `verbatim` strings**. Every one was mechanically re-read against the PDF above
(`tools/madrid-extract/verify_quotes.py`; raw result
[`../extracted/quote-concordance-2026-08-01.json`](../extracted/quote-concordance-2026-08-01.json)).

| verdict | n | what it means |
|---|---:|---|
| `ON-CLAIMED-PAGE` | **992** | present, on the page the record cites |
| `SPANS-FROM-CLAIMED` | **40** | starts on the cited page, runs onto the next |
| `ELSEWHERE` | **0** | *no quote is cited to a wrong page* |
| `TABLE-RECONSTRUCTION` | 25 | a pipe-delimited row **synthesised** from a PDF table |
| `NOT-FOUND` | 48 | not present as an exact string — every one explained below |
| `NO-PAGE-CLAIMED` | 216 | a quote with **no page citation at all** — uncheckable |

**All 48 `NOT-FOUND` are accounted for, and none is a fabrication.** Each was inspected:

| n | cause | example |
|---:|---|---|
| 36 | the record ends in an explicit `…` elision; the whole preceding text matches (108/109 and 190/191 chars) | Art. 6.3.5 *cota cero*; Art. 8.8.10 *cota del origen* |
| 5 | a **full stop inserted** where the document has none (`C. Siendo:` vs `C Siendo:`) | Art. 8.1.10 |
| 5 | the document interleaves a **numbered amendment footnote** inside the sentence, which the checker's stripper does not fully remove — a TOOL artefact, the text is present | Arts. 8.5.6, 8.3.5, 8.7.17 |
| 2 | an internal `…` / `[…]` elision inside the quote | Arts. 8.7.9, 8.7.20 |

### ⚠ WHAT THIS DOES **NOT** ESTABLISH — read before citing it

1. **It is not an L-449 signature and does not move the LEGISLATION axis by one field.** A
   concordance check proves a string was **copied** from the document. Whether the extracted
   *number* correctly **interprets** that string — whether *«fondo edificable»* means what the pack
   made it mean, whether an *ocupación* denominator is *parcela* or *manzana* — is a reading, and a
   reading is what L-449 reserves to a human. A second machine pass is not a human one.
2. **It is fidelity to a `carácter informativo` consolidation**, not to the BOCM.
3. **216 quotes carry no page and could not be checked at all.** They are not "clean"; they are
   unexamined, and that is a distinct value from "verified" (§CONTEXT-DATA-HONESTY).
4. **25 strings in a field named `verbatim` are not quotes.** They are reconstructed table rows
   (`"Menos de 12 | 3 | 11,50"`). The *cells* are on the cited page, but the string is a synthesis,
   and labelling a synthesis `verbatim` is a provenance mislabel worth fixing at source.

---

## 3. Coverage

| what | held? | source |
|---|---|---|
| PG97 Título 8, all Normas Zonales, consolidated text | ✅ yes | Compendio 2025 (`re-edition-only`) |
| PG97 Título 6 height-datum articles (6.3.5, Cap. 6.6) | ✅ yes | ↑ |
| The **BOCM publication** of PG97 | ❌ no | — |
| The **BOCM publication** of any *modificación puntual* the pack relies on | ❌ no | footnote references only |
| PG97 approval/BOCM date, re-verified | ❌ no | asserted, carried |
| Licence text for the `sigma.madrid.es` services | ❌ no | "no auth observed" is not a grant |

**Next highest-value retrievals**, in order:
1. **BOCM MPG 00/343** (08.11.2023 → BOCM 27.11.2023) — footnoted on Arts. 8.5.6 and 8.8.9, i.e. it
   touches live NZ-5/NZ-8 numbers. One gazette download.
2. **BOCM MPG 00/335** (10.05.2016 → BOCM 19.05.2016) — the amendment to **Cap. 8.3**, the chapter
   governing **60.458 %** of Madrid's zoned land.
3. The full modified-articles annex → an `effectiveDate` per cited article (CLOSURE-REGISTER row 14).

## 4. Change log

| date | change |
|---|---|
| 2026-08-01 | Seeded (L-677). Compendio 24-09-2025 committed and identity-verified (sha256 + PDF metadata + cover page). §MADRID-QUOTE-CONCORDANCE run over all 1,321 quotes: 1,032 present-and-correctly-cited, 0 mis-paged, 0 fabricated, 216 uncheckable. `tools/madrid-extract/index_pdf.py` repointed off a scratchpad path onto this corpus. |
