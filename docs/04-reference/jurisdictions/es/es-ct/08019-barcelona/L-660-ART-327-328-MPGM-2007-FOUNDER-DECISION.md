# L-660 — Barcelona's own Arts. 327 / 328 were modified in 2007. PRYZM ships the pre-2007 table.

> **STATUS: RAISED, NOT ACTIONED. No number in the codebase was changed.**
> This is the decision packet for an **L-449 signature**. It exists so the founder signs against a
> transcription that can be diffed and tested, not against prose in a commit message.
>
> Verified 2026-07-31 from the primary compendium, independently of the
> [`AMB-PGM-SCOPE-MAP.md`](../AMB-PGM-SCOPE-MAP.md) §5 pass that first raised it.

---

## 0. The one-paragraph version

PRYZM publishes clau **13a** heights from PGM Art. 327.2 as **8,55 / 11,60 / 14,65 / 17,70 / 20,75 /
23,80 m**. That is the **base metropolitan** ladder. The MMAMB compendium prints **footnote 49**
against Art. 327 naming **two** municipal rewrites — Badalona's and **Barcelona's own** — and
Barcelona's, at PDF p.277, restates Art. 327.2a as **9,00 / 12,35 / 15,70 / 19,05 / 22,40 /
25,75 m**. The same instrument restates **Art. 328.2a** (clau **13b**) at PDF p.278. Band boundaries
and storey counts are **identical** in both versions; only the metres move. If the 2007 modification
is in force, **every 13a and 13b height PRYZM publishes in Barcelona is between 0,45 m and 1,95 m
too low**, and none of them is in the wrong storey band.

**What is not established: that it is in force.** We hold the non-official *transcription*, not the
binding DOGC 4893 text and not the live RPUC/NUMAMB consolidation. §5 lists every gap.

---

## 1. The instrument — VERBATIM

`PGM-NNUU-metropolitana.pdf`, **PDF p.274** (printed p.273), header of the Barcelona annex section:

> **• Modificació de les Normes urbanístiques del Pla General Metropolità per a la modificació de
> les alçades reguladores en el tipus d'ordenació segons alineació de vial, al terme muncipal de
> Barcelona.** Aprovada definitivament per la Subcomissió d'Urbanisme del Municipi de Barcelona, en
> la sessió de **2 de març de 2007**. (DOGC núm. **4893** de **29/05/2007**).

*(«muncipal» is the compendium's own typo, reproduced.)*

The normative box then opens:

> **NORMATIVA URBANÍSTICA**
> **Modificació puntual de les normes urbanístiques del Pla general metropolità per a la
> modificació de les alçades reguladores en el tipus d'ordenació segons alineació de vial, de
> Barcelona**
> **Modificació de l'articulat: articulat proposat. En negreta, text afegit o modificat.**

⚠ **That last line is the reading key and it is load-bearing.** *Bold = added or modified.* In the
reproduced Art. 327 the **Alçada màxima** column is bold and the **Nombre màxim de plantes** column
is not — the instrument changes the **metres** and leaves the **storey counts** alone. Everything in
§4 follows from that.

It is confirmed by the compendium's own index (**PDF p.11**):

> 16. Modificació de les Normes urbanístiques del PGM per a la modificació de les alçades regulares
>     en el tipus d'ordenació segons alineació de vial, de 2 de març de 2007 … **273**

---

## 2. The footnotes that point at it — VERBATIM

Base **Art. 327**, PDF p.108 (printed 107), footnote apparatus:

> **49.** Veure modificació per al Municipi de **Badalona** a la pàg. **137**
>  Veure modificació per al Municipi de **Barcelona** a la pàg. **276**

Base **Art. 328**, PDF p.109 (printed 108):

> **50.** Veure modificació per al Municipi de **Badalona** a la pàg. **137**
>  Veure modificació per al Municipi de **Barcelona** a la pàg. **277**

Printed page + 1 = PDF page. So: 13a → PDF p.277, 13b → PDF p.278.

> ⛔ `bcnAlcadaReguladora.ts` asserted that this compendium *"flags its own local rewrites and
> **carries none on this article**"*. **It carries two.** That sentence was a false statement about
> the source and it is now corrected in the file, independently of whether the modification applies.

---

## 3. THE TWO MODIFICATIONS OF Art. 327 — both, as the task required

### 3.1 Barcelona — PDF p.277 (printed 276, footer «276 Barcelona»)

> **Art. 327.- Condicions d'edificació: subzona I, intensiva (13a)**
>
> **2a. Alçades**
>
> L'alçada reguladora màxima i el nombre màxim de plantes es determinen en funció de l'ample del
> vial a què doni front l'edificació, d'acord amb el quadre següent:

| Ample de vial | Alçada màxima | Nombre màxim de plantes |
|---|---|---|
| De menys de 8 m | **9,00 m** | PB + 1 pis |
| De 8 m a menys de 12 m | **12,35 m** | PB + 2 pisos |
| De 12 m a menys de 15 m | **15,70 m** | PB + 3 pisos |
| De 15 m a menys de 20 m | **19,05 m** | PB + 4 pisos |
| De 20 m a menys de 30 m | **22,40 m** | PB + 5 pisos |
| De 30 m o més | **25,75 m** | PB + 6 pisos |

> **L'alçada reguladora màxima i el nombre de plantes establerts al quadre anterior s'hauran de
> respectar conjuntament.**  *(bold in the original ⇒ added text)*
>
> L'alçada mínima de les plantes, inclosos els forjats i el paviment, serà de **3,05 m**. L'alçada
> **mínima** de la planta baixa es regirà per allò establert a les disposicions comunes per al tipus
> d'ordenació segons alineacions de vial.  *(roman type ⇒ unchanged)*

- **Instrument:** MPGM «…per a la modificació de les alçades reguladores en el tipus d'ordenació
  segons alineació de vial, al terme muncipal de Barcelona»
- **Approving authority:** Subcomissió d'Urbanisme del Municipi de Barcelona
- **Approved:** 2 March 2007 · **DOGC núm. 4893, 29/05/2007**

### 3.2 Badalona — PDF p.138 (printed 137, footer «Badalona 137»)

> **Article 327. Condicions d'edificació: Subzona I** (Es modifica l'apartat 2n)
>
> 2a Alçades. L'alçada reguladora màxima i el nombre màxim de plantes es determinen segons l'amplada
> del vial al qual doni la façana de l'edificació, d'acord amb el quadre següent:

| Amplada de vial (metres) | Alçada màxima (metres) | Nombre màxim de plantes |
|---|---|---|
| De menys de 8 m | 9,00 | PB + 1 P |
| De 8 a menys de 12 m. | 12,35 | PB + 2 P |
| De 12 a menys de 15 m. | 15,70 | PB + 3 P |
| De 15 a menys de 20 m | 19,05 | PB + 4 P |
| De 20 a menys de 30 m. | 22,40 | PB + 5 P |
| De 30 m. o més metres | 25,75 | PB + 6 P |

> 'alçada mínima de les plantes, inclosos el forjat i el paviment, ha de ser de **3'05 m**. […]
>
> **Article 328. Condicions d'edificació: subzona II, semiintensiva.** (Es modifiquen els apartats
> 2n i 5è) — 8,25 / 12,00 / 15,40 / 18,80, PB+1…PB+4.

- **Instrument** (PDF p.126, printed 125): «**Modificació puntual de les Normes Urbanístiques del
  Pla General Metropolità en l'àmbit del municipi de Badalona.** Aprovada definitivament pel
  conseller de Política Territorial i Obres Públiques el **6 de Juny de 2008**. (DOGC núm. **5224**
  de **29/09/2008**).»

> **The two municipalities state the SAME six values, by two separate instruments, two authorities
> and two DOGC references, fifteen months apart.** The 3,35 ladder is therefore **not**
> metropolitan — it is separately in force in at least two municipalities and must be cited to
> whichever one governs the parcel.

> ⚠ **A CITATION ALREADY IN THE REPO IS BADALONA'S, LABELLED AS BARCELONA'S.**
> `claus/EXTRACTION-PROTOCOL.md` Step 5 cited the Art. 327 §2 modification as *"exp. 2007/028428,
> DOGC 29-09-2008"*. **29/09/2008 is DOGC 5224 — Badalona's date**, and the geoportal page it came
> from is `…/Normativa/**08015**_13a.htm`, and **08015 is Badalona** (the municipality-code trap
> L-583 §1 already recorded hitting us twice). Barcelona's is **DOGC 4893, 29/05/2007**. Corrected
> in that file; the expedient number `2007/028428` is *not* independently verified here and is
> flagged rather than reassigned.

---

## 4. SCOPE AND FORCE

### 4.1 Citywide, or a sub-area? — **CITYWIDE on the face of the source**

The instrument's only territorial qualifier is **«al terme muncipal de Barcelona»**. Read
positionally across the whole instrument (PDF pp. 274–278; p.279 opens an unrelated one), it names
**no sector, no *àmbit*, no *front edificatori*, no plànol, and no transitional clause**. It is a
modification of the *articulat* of the NNUU, so it governs wherever those articles govern inside the
municipal term.

### 4.2 327 only, or 327 + 328? — **BOTH, and two more articles besides**

| Article | Governs | PDF page |
|---|---|---|
| **Art. 239** | *Alçada* — disposicions comunes, tipus d'ordenació segons alineació de vial | 274–275 |
| **Art. 320.3a** | Nucli antic, clau **12** — 7,90 / 11,25 / 14,60 / 17,95 m, PB+1…PB+4 | 276 |
| **Art. 327.2a** | Densificació urbana subzona I, clau **13a** — the six bands in §3.1 | **277** |
| **Art. 328.2a** | Densificació urbana subzona II, clau **13b** | **278** |

⇒ The blast radius is **13a + 13b + 12** — by PRYZM's own area sampling
(`BARCELONA-COMPLETE-COVERAGE-PLAN.md` §2.2) **24.0 % + 8.7 % + 11.3 % = 44.0 % of Barcelona's
private buildable land**, and by that document's own note the *parcel-count* share is **higher**
still, because 13a/13b/12 are dense small-parcel fabric.

Art. 328 as restated (PDF p.278) — bands and storey counts again unchanged:

| Ample de vial | base | **modified** | plantes |
|---|---|---|---|
| De menys de 8 m | 7,55 m | **8,25 m** | PB + 1 pis |
| De 8 m a menys d'11 m | 10,60 m | **12,00 m** | PB + 2 pisos |
| D'11 m a menys de 15 m | 13,65 m | **15,40 m** | PB + 3 pisos |
| De 15 m endavant | 16,70 m | **18,80 m** | PB + 4 pisos |

⚠ Art. 328 also gains, **in bold**: «L'alçada total mínima, inclosos forjat i paviment, serà de tres
metres cinc centímetres (3,05 m).» — replacing the base's «L'alçada màxima total, inclòs el forjat,
ha de ser de 2,75 m. per planta pis, excepte a les edificacions amb façana a carrer de més de
15 m., a les quals serà obligada l'alçada mínima de 3,05 m.» **A signed application must carry that
clause too, not only the four numbers.**

### 4.3 Is there a LATER modification superseding it? — **NOT LOCATED. NOT "none".**

Within this compendium, Barcelona's recorded instruments run to **#17** (Art. 264, 22-07-2009, DOGC
núm. 5509 de 19/11/2009) and **none after 2007 touches Arts. 327 or 328**. That is the strongest
statement available and it is **weak**, three times over:

1. The compendium is consolidated only to **31-12-2009** — sixteen years of *modificacions
   puntuals* are outside it by construction.
2. It filters: «**no hi figuren totes les modificacions** dels textos citats, només aquelles que
   s'han considerat més rellevants» (PDF p.3).
3. It disclaims: «**No es tracta d'una publicació oficial sinó merament divulgativa.** Per tant, en
   cas de discrepància, prevaldrà el redactat contingut en els textos oficialment aprovats i
   publicats en els butlletins pertinents.» (PDF p.3).

⇒ Record **`not-located-in-source`**. **Never `does-not-exist`.** A document that declares itself
incomplete cannot certify an absence.

---

## 5. THE 3,05 / 3,35 RECONCILIATION — SETTLED, AND THE OLD REJECTION WAS A CONFLATION

`EXTRACTION-PROTOCOL.md` Step 4 rejected the circulating table partly on the grounds that it implied
*"3,35 m per floor"* against *"the generic PGM at 3,05 m/floor"*. **Both figures are in the same
article, and they are different quantities.**

| Source | Storey MINIMUM | Band STEP |
|---|---|---|
| **Base** Art. 327.2a (PDF p.108) | «L'alçada mínima de les plantes, inclosos els forjats i el paviment, ha de ser de **3'05 m**.» | 3,05 m (8,55→11,60→…→23,80) |
| **Modified** Art. 327.2a (PDF p.277) | «L'alçada mínima de les plantes, inclosos els forjats i el paviment, serà de **3,05 m**.» — *roman type, i.e. **unchanged*** | **3,35 m** (9,00→12,35→…→25,75, exactly +3,35 five times) |

⇒ **CONFIRMED: band step 3,35 m, storey minimum 3,05 m.** The modification does not permit taller
storeys. It permits **more headroom above the same six storey counts** — which is precisely what the
added clause *«L'alçada reguladora màxima i el nombre de plantes establerts al quadre anterior
s'hauran de respectar conjuntament»* exists to police.

> A wrong reason produced a right-looking refusal, and **the refusal outlived the reason**.

---

## 6. ⚠⚠ AND IT RE-OPENS L-528 — 22,40 m IS A RIVAL *ALÇADA REGULADORA* AFTER ALL

`bcnAlcadaReguladora.ts` and `L-583-LEGAL-PARAMETERS-SOURCED.md` §3 both recorded the
20,75-vs-22,40 question as **RESOLVED** — and they resolved it **two different, incompatible ways**:

| Record | "22,40 m is…" |
|---|---|
| `L-583-LEGAL-PARAMETERS-SOURCED.md` §3 | a total constructed height under the **OME 1978** (badalots, railings, rooftop plant). *"The answer is (a)."* |
| `bcnAlcadaReguladora.ts` (until today) | the ***alçada reguladora incrementada*** of **Art. 21 of the 2002 Ordenança de l'Eixample** (≤ 2,25 m cornice increment). |
| **This document** | **the PB+5 row of Art. 327.2a as modified for Barcelona in 2007.** |

The third reading is by far the most parsimonious, and two independent facts already in the repo
support it:

1. **The primary source prints it.** PDF p.277, in the metre column of Art. 327.2a itself.
2. **An official Ajuntament de Barcelona *Certificat Urbanístic* for a 20 m street gives 22,40 m
   (PB+5) "via Arts. 238/240/327"** — `L-526-LEGAL-FINDINGS.md`. It cites **Art. 327**, not the OME
   and not the Eixample ordinance. The rival 20,75 m in that same record came from a **Santa Coloma
   de Gramenet** transcription of the base table — i.e. *another municipality's copy*.

The Art. 21 identification rested on `20,75 + 1,65 = 22,40` with `1,65 ≤ 2,25`. **Any** figure
≤ 23,00 m satisfies that, so the arithmetic distinguished nothing; L-583 §3 conceded in its own
words that *"the listed allowances do not obviously sum to the 1,65 m gap, so the composition of
22,40 m is unverified"*.

> ⇒ **L-528 is RE-OPENED.** Art. 21 remains a real, conditional allowance and
> `EIXAMPLE_CORNICE_INCREMENT_MAX_M` is unchanged in value and in use. What is **withdrawn** is the
> identification of the circulating 22,40 m with it.
>
> *When two records disagree and both say "resolved", neither is.* (EXTRACTION-PROTOCOL Step 9 —
> written after L-594, and now earning its place a second time.)

---

## 7. IMPACT — per band, and how many parcels change band

### 7.1 The per-band delta (clau 13a)

| Band (*ample de vial*) | plantes | **today** | **under the modification** | Δ | band change? |
|---|---|---|---|---|---|
| < 8 m | PB+1 | 8,55 m | 9,00 m | **+0,45 m** | no |
| 8 – <12 m | PB+2 | 11,60 m | 12,35 m | **+0,75 m** | no |
| 12 – <15 m | PB+3 | 14,65 m | 15,70 m | **+1,05 m** | no |
| 15 – <20 m | PB+4 | 17,70 m | 19,05 m | **+1,35 m** | no |
| 20 – <30 m | PB+5 | 20,75 m | 22,40 m | **+1,65 m** | no |
| ≥ 30 m | PB+6 | 23,80 m | **25,75 m** | **+1,95 m** | no |

Clau 13b: **+0,70 / +1,40 / +1,75 / +2,10 m**, same four bands, same PB+1…PB+4.

### 7.2 ⚠ HOW MANY EIXAMPLE PARCELS CHANGE BAND: **ZERO. By construction.**

This was the task's headline question and the answer is structural, not statistical. The base and
modified tables have **identical band boundaries** (`<8, 8–12, 12–15, 15–20, 20–30, ≥30`) and
**identical storey counts** (`PB+1 … PB+6`). The instrument only rewrote the metre column — its own
bold-face reading key says so. Therefore:

- **No parcel is reclassified.** Not "few" — none.
- **Every 13a parcel that resolves to a height today gets a different metre value.** The affected
  population is **100 %** of resolved 13a parcels, not a subset.
- **The entire street-width apparatus is orthogonal to this decision.** `BAND_EDGE_GUARD_M`,
  `effectiveBandEdgeGuard_m`, the L-586 spread widening, the `curated-cerda-nominal` allow-list, the
  `snapped-to-declared-quantum` tier — none of them changes behaviour by one parcel, because the
  bands they classify into are the same bands. Applying the modification produces **no new
  refusals** and **no new band-edge risk**. That is a rare and welcome shape for a legal correction.

### 7.3 What it means street by street, on the widths we actually hold

`bcnOfficialStreetWidths.ts` currently carries 26 curated Eixample entries. All 26 sit in the top two
bands, so the whole allow-list moves by one of two amounts:

| Δ | band | n | streets |
|---|---|---|---|
| **+1,95 m** (23,80 → 25,75) | ≥ 30 m, PB+6 | **8** | Gran Via de les Corts Catalanes (50), Diagonal (50), Meridiana (50), Paral·lel (50), Pg. de Sant Joan (50), Pg. de Gràcia (60), Aragó (30), Rambla de Catalunya (30) |
| **+1,65 m** (20,75 → 22,40) | 20 – <30 m, PB+5 | **18** | Pau Claris, Roger de Llúria, Bruc, Girona, Bailèn, Balmes, Aribau, Muntaner, Casanova, Villarroel, Comte d'Urgell, Consell de Cent, Diputació, València, Mallorca, Provença, Rosselló, Còrsega |

The flagship parcel **CL Pau Claris 155** goes **20,75 m → 22,40 m** — and 22,40 m is exactly what
Barcelona's own *Certificat Urbanístic* returned for a 20 m street (§6). That is the sharpest single
piece of corroboration in this document.

> Parcels reached through the measured/snapped tiers rather than the allow-list are affected in the
> same way and by the same per-band amounts; no parcel-level count is quoted here because PRYZM
> holds no Barcelona parcel register, and an invented count would be the fabrication this whole file
> exists to prevent.

---

## 8. EXACTLY WHAT THE FOUNDER IS BEING ASKED TO SIGN

**The proposition:**

> *"I accept that PGM Arts. 327.2a and 328.2a, for parcels in the terme municipal de Barcelona, are
> the versions restated by the MPGM approved by the Subcomissió d'Urbanisme del Municipi de
> Barcelona on 2 March 2007, DOGC núm. 4893 de 29/05/2007 — and that PRYZM may publish
> 9,00 / 12,35 / 15,70 / 19,05 / 22,40 / 25,75 m for clau 13a and 8,25 / 12,00 / 15,40 / 18,80 m for
> clau 13b in Barcelona, in place of the base metropolitan values."*

**What signing WOULD authorise:**
- Swapping `BCN_ALCADA_REGULADORA_TABLE`'s six metre values and
  `BCN_ALCADA_SEMIINTENSIVA_TABLE`'s four, **for Barcelona (08019) only**.
- Nothing else. Band boundaries, storey counts, the refusal machinery, the provenance ladder and the
  `estimated-ruleset` confidence tier all stay exactly as they are.

**What signing would NOT authorise, and must not be read as:**
- ❌ **Any change to another municipality.** L'Hospitalet, Cornellà and Sant Boi have **no** Art. 327
  footnote entry: the base table remains their best reading. Badalona has its **own** instrument
  with the same values — cite Badalona's, not Barcelona's.
- ❌ **Promoting the confidence tier.** The pack stays `estimated-ruleset` / `ordinance-pdf`. Signing
  the source ≠ certifying the numbers (EXTRACTION-PROTOCOL Step 8), and the per-parcel figures are
  still uncertified against the MUC/RPUC *fitxa urbanística*.
- ❌ **Flipping any `*_ENVELOPE_VERIFIED` flag.** They stay **false**.
- ❌ **Closing L-528.** §6 re-opens it. A signature here makes the 22,40 m question *simpler*, not
  closed.
- ❌ **Any claim about clau 12 (Art. 320.3a) or Art. 239.** They are inside the same instrument and
  are transcribed here for completeness, but no clau-12 height is shipped and none is proposed.
- ❌ **Any claim about 13E.** The 13a/13E question (EXTRACTION-PROTOCOL Step 6) is untouched; this
  instrument does not mention 13E.

**Recommended alternative to signing now:** obtain **DOGC núm. 4893 (29/05/2007)** or the live
RPUC/NUMAMB consolidated Art. 327 for 08019 and sign against *that*. It is a single, named,
retrievable document. Signing against a source that calls itself *«merament divulgativa»* imports
that disclaimer into the product.

---

## 9. EVERYTHING WE COULD NOT VERIFY

| # | Not verified | Why it matters | How to close it |
|---|---|---|---|
| 1 | **The binding text.** We hold the MMAMB compendium's *transcription*, which disclaims itself (§4.3). | If the compendium mis-transcribed, we would ship a wrong table with a confident citation — the worst outcome in this file. | Retrieve **DOGC 4893 (29/05/2007)**. |
| 2 | **Live RPUC / NUMAMB consolidation.** Attempted 2026-07-31: `www.amb.cat` NUMAMB Art. 327 → **HTTP 403** behind a Transparent Edge anti-bot challenge (same wall as L-583 §7); AMB geoportal `08019_13a.htm` and `08019_DISPOSICIONS TRANSITÒRIES.htm` → **404**. | The live consolidation is the only thing that shows modifications **after 2009**. | Retrieve interactively from a browser, or via RPUC. |
| 3 | **Any modification after 31-12-2009.** `not-located-in-source`, **not** absent. | Sixteen years unexamined. A 2015-era MPGM could have moved these tables again. | RPUC municipal instrument list for 08019. |
| 4 | **The expedient number `2007/028428`** cited in EXTRACTION-PROTOCOL Step 5. It travelled with **Badalona's** DOGC date off a **08015** page. | A wrong expedient number survives review, exactly like the "AMB Dec 2010" citation L-526 killed. | Read the expedient off the DOGC 4893 edicte. |
| 5 | **Whether Barcelona's *Certificat Urbanístic* 22,40 m is the modified table or something else.** §6 argues it is; it is not proven. | It is the strongest independent corroboration and it is circumstantial. | Obtain a certificate whose citation names the 2007 MPGM explicitly. |
| 6 | **Clau 13E.** Unaffected and unaddressed. | Step 6's deliberate non-decision stands. | — |
| 7 | **Art. 239's substantive changes** (the `pla superior de l'últim forjat` datum, the 30° gàlib for rooftop plant, the neighbour-coronament limit on railings). Transcribed nowhere in code. | These change *how the height is measured*, not just its value — potentially a larger effect than the table swap. | Separate work item; not part of this signature. |

---

## 10. HOW p.277 WAS RECOVERED — the reusable technique

The annex pages embed **subset fonts with no ToUnicode**, glyph-shifted (+29 / −29 families).
`extract_text()` returns the prose with **every digit dropped**, so Art. 327 surfaces *without its
table* — **nothing rather than garbage**, which is indistinguishable from "the modification does not
exist". That is why three verification rounds recorded the table as *"never located in the accepted
source"*.

```py
# BOTH were used on p.277 and they agree. The raster is the one to trust.
page.get_text()                 # +29-shifted prose, ALL DIGITS MISSING  ← the trap
page.get_pixmap(dpi=170)        # renders correctly; read the image      ← the fix
```

`pp. 196–209` are a **third, still-undecoded** encoding. **p.277 is not in that family** — it
decodes as +29 and renders cleanly, so this transcription carries no OCR ambiguity.

---

*L-660 · 2026-07-31 · Authority: C58 §1.2/§1.4, ADR-0270, ADR-0271, ADR-0275, C63 ·
Protocol: `claus/EXTRACTION-PROTOCOL.md` (Steps 4, 5, 8, 9) · Related: L-449, L-525a, L-526, L-528,
L-583, L-586, L-590, `../AMB-PGM-SCOPE-MAP.md` §5.*
