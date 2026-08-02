# Murcia corpus — index, and the SUPERSESSION CHECK

Primary sources filed in `pdf/`, with what each one is, and the article-by-article concordance
between the two published consolidations. Retrieval routes and HTTP statuses:
[`RETRIEVAL-LOG.md`](./RETRIEVAL-LOG.md).

---

## 1 · What is filed

| file | pages | bytes | SHA-256 (first 16) | what it is |
|---|---:|---:|---|---|
| `pdf/PGOU-MURCIA_TR-2012-12_vol11_normas-urbanisticas.pdf` | **205** | 2 352 553 | `ab71c65151571815` | ★ **the CITED edition.** *PGMO de Murcia — Texto Refundido diciembre 2012, VOLUMEN 11 — Normas Urbanísticas.* Embedded PDF title `TR PG vol_11   NN UU.signed.pdf`; PDF created 2016-10-07, author `aam40v`. Served by `urbanismo.murcia.es`. |
| `pdf/PGOU-MURCIA_adaptado-DL-1-2005_normas-urbanisticas_murcia-es-28-02-2017.pdf` | **196** | 1 245 444 | `38c7878066306856` | *Normas Urbanísticas del Plan General de Murcia — **Documento adaptado al Decreto Legislativo 1/2005***. Embedded PDF title «NORMAS URBANÍSTICAS REFUNDIDAS ADAPTADAS A LS REG. **act. 28_02_2017**»; PDF created 2018-03-01, modified 2019-02-20. Served by `www.murcia.es`; the file linked from the municipality's public *Normas Urbanísticas* page, and the file the founder delivered in-conversation. |

Both are born-digital (not scans). Neither carries a *«sin valor normativo»* disclaimer — checked,
not assumed: the strings *«sin valor normativo»* and *«valor normativo»* appear **zero** times in
either document.

**Municipality check (the Badalona discipline — always verify the MUNICIPALITY, never the numbers):**
both title blocks read **Murcia**, `C.I.F: P-3003000-A`, Glorieta de España 1. ✅

---

## 2 · ⭐ THE SUPERSESSION CHECK — **RUN, AND IT COMES BACK CLEAN**

`supersessionChecked` was `false` and every Murcia artefact warned that *"the 2017 re-edition … has
NOT been diffed against the 2012 TR every quote came from. Concordance UNVERIFIED."* It is now
verified.

**Method** (reproducible; the script is throwaway but the method is not): `pdftotext -layout -enc
UTF-8` on both PDFs → strip the repeating page furniture → segment on `Artículo X.Y.Z.` headings →
collapse whitespace → SHA-256 each article body → compare. 347 articles segmented from the 2012 TR,
345 from the 2005-adaptation.

### 2.1 · The verdict on the 22 articles the rule pack cites

**All 22 zone-condition articles are BYTE-IDENTICAL between the two editions.** Every packed zone,
every cited refusal, and both delegation clauses:

| article | what it governs in the pack | 2012 TR ↔ murcia.es |
|---|---|---|
| 5.2.3 | **MC** — packed | ✅ IDENTICAL |
| 5.4.3 | **MG** — packed | ✅ IDENTICAL |
| 5.5.3 | **RM1 / RM2** packed · base **RM** refused (street-width table) | ✅ IDENTICAL |
| 5.9.3 | **RD** + **RD1** — packed | ✅ IDENTICAL |
| 5.10.3 | **RF** — packed | ✅ IDENTICAL |
| 5.11.3 | **RG** — packed | ✅ IDENTICAL |
| 5.12.3 | **RH** — packed | ✅ IDENTICAL |
| 5.14.2 / 5.14.3 | **RL** — the interim regime + its delegation | ✅ IDENTICAL (both) |
| 5.18.3 / 5.19.3 / 5.20.3 | **IC / IX / IG** — packed, incl. the *«altura libre»* no-limit findings | ✅ IDENTICAL (all three) |
| 5.23.3 | **AJ** — packed | ✅ IDENTICAL |
| 5.3.3 | **RC** — refused (street-width) | ✅ IDENTICAL |
| 5.6.3 | **MZ** — refused (FAR algorithm + delegated footprint) | ✅ IDENTICAL |
| 5.7.3 | **RN** — refused (street-width) | ✅ IDENTICAL |
| 5.8.3 | **RB** — refused (existing-building-derived) | ✅ IDENTICAL |
| 5.15.3 | **RU** — refused (preservation) | ✅ IDENTICAL |
| 5.21.3 | **RT** — refused (neighbour-derived) | ✅ IDENTICAL |
| 5.22.3 | **MX** — refused (frontage class) | ✅ IDENTICAL |
| 5.24.5 / 5.24.6 | **RR / TR / IR / GR** remitted | ✅ IDENTICAL (both) |
| 5.25.3 | the delegation clause (Estudios de Detalle) | ✅ IDENTICAL |
| 6.5.1 | *ordenación orientativa* GP / IP / TC / AE | ✅ IDENTICAL |
| 6.6.2 | **TA** expediente pointer (the founder's parcel) | ✅ IDENTICAL |
| 1.1.4 | *interpretación — «la interpretación más favorable a la menor edificabilidad»* | ✅ IDENTICAL |

⇒ **No published Murcia number is citing a superseded text.** The 23.51 % of buildable land that
renders today rests on articles that read the same in both consolidations the municipality serves.

### 2.2 · The four cited articles that DO differ — and none of them moves a number

| article | difference | does it move a published value? |
|---|---|---|
| **1.1.1** | 2012: *"El presente Plan General **de Ordenación Urbana** Municipal…"* — the murcia.es file lacks *de Ordenación Urbana*. The §2 *vigencia* sentence the pack quotes is **identical**. | **No** — the quoted sentence is unchanged. |
| **5.1.5** | Cross-references. 2012: *"Capítulo **24** … Capítulos **25 y 26**"*; murcia.es: *"Capítulo **22** … Capítulos **23 y 24**"*. | **No** — and see §3: the murcia.es numbering is internally inconsistent with its own chapter headings. |
| **5.26.3** | The *ámbito* code prefixes lost a trailing hyphen: 2012 `PA-` / `PD-`, murcia.es `PA` / `PD`. The delegation sentence Art. 5.26.3.3 that the whole refusal architecture rests on is **identical**. | **No.** |
| **6.2.2** | 2012 §§1–3 read *"planes parciales **o especiales**"*; murcia.es reads *"planes parciales"* only. 2012 §5 adds the zone **ZE** and the phrase *"En atención a sus **densidades y categoría**"* (murcia.es: *"a sus intensidades"*). | **No** — the 2012 wording is BROADER, so the delegation ground the pack cites (Art. 6.2.2.3) is at least as wide in the edition we cite. Citing the narrower edition could only *shrink* the refusal, never widen a published envelope. |

---

## 3 · WHICH EDITION IS LATER — and the answer is not the one the filename suggests

The inherited framing treated the murcia.es file as a *"2017 re-edition"* that might **supersede**
the 2012 TR. The evidence runs the other way. Four independent signals, all agreeing:

1. **The 2012 TR contains two articles the murcia.es file does not:** `Art. 2.1.10` (*Suelo no
   urbanizable* — the ownership-rights article) and **`Art. 6.2.7` (zone `ZE`, *Residencial de alta
   densidad para sustitución de uso agropecuario*)**. Consolidations add zones; they do not usually
   delete one and leave the surrounding numbering intact. The murcia.es file has **no** article the
   2012 TR lacks.
2. **The murcia.es file's Art. 5.1.5 is internally inconsistent.** It routes the UA/UH/UM ámbitos to
   *"Capítulo 22"* while its own body heading for that content reads **`CAPÍTULO 24. ORDENACIÓN
   REMITIDA AL PLANEAMIENTO`**. The 2012 TR says *"Capítulo 24"* — i.e. the 2012 TR **fixed** a
   stale cross-reference. Corrections travel forward.
3. **Terminology.** Art. 6.2.3's figure is *"El **aprovechamiento de referencia** será de 0,751 m²/m²"*
   in the 2012 TR and *"El índice de edificabilidad sobre la superficie bruta del sector será de
   0,75 m²/m²"* in the murcia.es file. *Aprovechamiento de referencia* is the post-2008 state-law
   vocabulary; Art. 6.2.7 in the 2012 TR cites **TRLSRM**.
4. **Art. 6.2.2 is broader in the 2012 TR** (*"planes parciales o especiales"*), which is the
   direction an amendment closing a loophole travels.

⇒ **The murcia.es PDF is an EARLIER consolidation that the municipality still hosts and still links.
Its «act. 28_02_2017» label is a FILE-UPDATE date, not an edition date** — confirmed by its own PDF
metadata (created 2018-03-01, modified 2019-02-20, i.e. the *file* postdates the label too).

**Consequence, stated plainly:** PRYZM cites the **later** of the two published consolidations, not
the earlier one. `PRIMARY-SOURCE-VERIFICATION-2026-08-01.md` §2 concluded the delivered file was the
2012 TR's *"legal antecedent, not the TR itself"* — that reading is **confirmed**, and it is the
document the municipality's public page links, which is why it looked authoritative.

⚠ **What this does NOT establish.** Neither file is the **BORM gazette instrument** that approved the
revision. `MURCIA_PGOU_BORM_REFERENCE` stays `not-located-in-source`. And a THIRD, still-later
consolidation could exist without being linked from either portal; *not located* ≠ *does not exist*.

---

## 4 · What was NOT re-verified here

The 79 articles that differ across the whole corpus (of 347) are **outside** the pack's citation set
and were not read. They are recorded so the number is not mistaken for zero: `1.1.1 1.1.2 1.1.5
1.2.2 2.1.5–2.1.9 2.2.3 2.4.1 2.6.1 3.1.5 3.2.3 3.7.2 3.7.3 3.7.5 3.7.8 4.1.2 4.5.15 5.1.5 5.3.5
5.5.1 5.7.4 5.12.4 5.15.4 5.16.1 5.26.2 5.26.3 5.26.6 6.1.2–6.1.7 6.2.1–6.2.6 6.3.2 6.3.4–6.3.7
6.4.1 6.4.2 6.5.2–6.5.5 6.6.4 6.6.5 7.* 8.* 9.* 10.*`. If a future pack quotes any of them, diff it
first.

**The PECHA risk is untouched by this check.** Art. 5.2.1 / 5.2.3 subordinate `MC` to the *Plan
Especial del Conjunto Histórico-Artístico* where it regulates specifically, and PRYZM does not hold
the PECHA. That is `PRIMARY-SOURCE-VERIFICATION-2026-08-01.md` §4 and it stays **open**: filing the
Normas does not file the PECHA.

---

*Maintainer: UNASSIGNED. Created 2026-08-01, L-676. Authority: C63 §3 Axis 2 · L-449 · L-661 · L-674.*
