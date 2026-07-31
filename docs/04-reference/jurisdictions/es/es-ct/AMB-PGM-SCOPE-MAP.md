# AMB / PGM-1976 — the article-by-article SCOPE MAP

> **The question.** Barcelona's shipped rule packs transcribe **PGM-1976**, the *Pla General
> Metropolità*. If the operative articles are **metropolitan**, the same articles govern
> L'Hospitalet, Badalona, Sant Boi, Cornellà and the rest, and extending PRYZM across the metro
> area is a matter of reading per-municipality **footnotes** rather than re-transcribing articles.
>
> **The answer, in one line.** The base articles **are** metropolitan, and the source **declares its
> own per-municipality overrides** — but the compendium that carries them is **expressly
> non-official, expressly non-exhaustive, and sixteen years stale**, so "no footnote" is *evidence
> of* metropolitan force, never *proof* of it. **The four cited refusals stand — for better reasons
> than the ones currently written in them.**

*Derived 2026-07-31 from `08019-barcelona/PGM-NNUU-metropolitana.pdf` read POSITIONALLY. Authority:
C58 §1.2/§1.4/§1.7a · C60 §3 · C63 · ADR-0270 · ADR-0271 · `claus/EXTRACTION-PROTOCOL.md` ·
§CONTEXT-DATA-HONESTY. Machine-readable form: `packages/site-parcel-data/src/rulepacks/esAmbPgmScope.ts`.*

---

## 0. How to read this document — the extraction was the hard part

Two defects in the PDF make a naive read produce **confidently wrong absences**. Both are now
handled; both will recur for anyone who re-derives this.

1. **Two-column layout.** `extract_text()` interleaves the columns and destroys article boundaries.
   Everything below was read with PyMuPDF `page.get_text("dict")`, sorting lines by
   `(column, y, x)` with the column split at 48 % of page width.
2. **Subset fonts with no `ToUnicode` map — and they silently eat DIGITS.** Many annex pages embed
   fonts whose glyph codes are shifted. Two families exist:
   * **+29** (`\x15`→`2`, `\x03`→` `, `$`→`A`, `3`→`P`) — most of the Badalona / Barcelona annex.
   * **−29** (`M`→`0`, `K`→`.`, `b`→`E`, `~`→`a`) — the index and the modification headings.
   A text pass returns ~12 alphanumerics on these pages, so **an article looks ABSENT and every
   number in its table vanishes**. Decoding recovered them; a raster fallback
   (`page.get_pixmap(dpi=150)`) is only needed for PDF pp. 196–209, a third font family that is not
   a uniform shift.

> ⚠ **This is the defect class that produced three prior research rounds at "98 % confidence".**
> If a footnote or modification block looks empty, decode or render it before concluding it is.

---

## 1. The base articles ARE metropolitan — Art. 1.1, verbatim

> **Art. 1. Àmbit territorial del Pla** *(PDF p.24, printed p.23)*
> «1. L'objecte d'aquest Pla General és l'ordenació urbanística del territori que integra
> **l'Entitat Municipal Metropolitana de Barcelona**, definit a l'article 2.1 del Decret llei
> 5/1974, de 24 d'agost.»

So the NNUU are, by their own terms, one plan for one metropolitan territory. **Barcelona has no
privileged position in the base text** — it appears only where a footnote says it does.

### ⚠ But "AMB municipality" ≠ "PGM municipality"

The **EMMB / Corporació Metropolitana** of *Decret llei 5/1974* is the **pre-2011, 27-municipality**
body. Today's **AMB has 36 municipalities** (Llei 31/2010, de 3 d'agost). **Nine AMB municipalities
are therefore outside the PGM's territorial scope entirely** and are governed by their own POUM.

**Any registration that assumes "in the AMB ⇒ PGM applies" is wrong for those nine.** The brief's
framing ("PGM-1976 … governs the whole AMB") is the first thing this exercise falsified.

---

## 2. The mechanism: the source declares its own overrides

Each base article heading carries a **numbered footnote marker**, and the footnote reads:

> `NN.  Veure modificació per al Municipi de <MUNICIPALITY> a la pàg. <PRINTED PAGE>`

…pointing into the **Modificacions annex** (PDF pp. 124–385), which is organised **alphabetically by
municipality**, each modification carrying its own approval authority, date and DOGC reference.

Two verbatim examples, read with their page coordinates:

> **49.** Veure modificació per al Municipi de **Badalona** a la pàg. **137**
> Veure modificació per al Municipi de **Barcelona** a la pàg. **276**
> — *footnote to **Art. 327**, PDF p.108 col. 1, y=618.7 / y=628.7*

> **52.** Veure modificació per al Municipi de **Badalona** a la pàg. **128**
> — *footnote to **Art. 330**, PDF p.109 col. 1, y=628.6*

Printed page + 1 = PDF page throughout.

**⇒ The observation that started this task is correct and it generalises.** The document is a
scope map. Section 4 transcribes it.

---

## 3. ⚠⚠⚠ THE THREE CAVEATS THAT CAP EVERY CONCLUSION BELOW

All three are the compendium's **own words**. They are why this exercise ends in better-grounded
refusals rather than in new numeric packs.

### 3.1 It is NOT exhaustive — *this is the decisive one*

> *(PDF p.3)* «Aquesta publicació de la MMAMB recull, en català, les Normes urbanístiques del PGM
> … amb les modificacions substancials fins el 31 de desembre de 2009, relacionades per municipis.
> Amb la qual cosa **no hi figuren totes les modificacions dels textos citats, només aquelles que
> s'han considerat més rellevants**.»

**An article with no footnote may still have been rewritten by a municipality.** The editors
filtered for "most relevant". So the strongest statement this document supports is:

> *"This compendium records no modification of Art. N for municipality M."*

It does **not** support *"Art. N is unmodified in M."* Treating the second as if it were the first
is precisely the §CONTEXT-DATA-HONESTY failure — **absence of evidence rendered as evidence of
absence**, which is the same value-shape confusion as L-422 / L-457 / L-467 / L-469.

### 3.2 It is NOT official

> *(PDF p.3)* «**No es tracta d'una publicació oficial sinó merament divulgativa.** Per tant, en cas
> de discrepància, prevaldrà el redactat contingut en els textos oficialment aprovats i publicats en
> els butlletins pertinents.»

The binding text is the instrument in the DOGC/BOP. This PDF is a **finding aid** — excellent for
locating *which* instrument to cite, never itself the citation of record.

### 3.3 It is stale, and narrower than the AMB

Consolidated only to **31-12-2009**. Sixteen years of later *modificacions puntuals* are absent —
including anything that post-dates the AMB's own creation. And see §1: the territory is the 1974
EMMB, not the 2010 AMB.

*(Aside, correcting the record: L-526 held that an "AMB Dec 2010" attribution was impossible because
the AMB did not exist until 21-07-2011. The publisher here is the **MMAMB** — Mancomunitat de
Municipis de l'Àrea Metropolitana de Barcelona — which **did** exist in 2010. The December-2010
date is genuine; the institution named was the one that was wrong.)*

---

## 4. THE SCOPE MAP

Every base article PRYZM's packs depend on. `—` = the heading carries **no footnote marker at all**.
Printed pages are what the footnote cites; PDF page = printed + 1.

| Art. | Governs | fn | Municipalities the source names as rewriting it |
|---|---|---|---|
| **238** | Alçada reguladora / amplada de vial | 13 | **Badalona** (p.125) |
| **242** | *Profunditat edificable* — the ADR-0271 construction | 15 | **Badalona** (p.135) |
| **306** | Ordenació volumètrica específica (18) | 37 | Cerdanyola del Vallès (p.287); Sant Cugat del Vallès (p.348) |
| **314** | Qualificacions zonals | — | *(none recorded)* |
| **316** | Edificabilitat — nucli antic (12) | — | *(none recorded)* |
| **320** | Condicions d'edificació — nucli antic (12) | 46 | **Badalona** (p.136); **Barcelona** (p.274) |
| **322** | Edificabilitat — densificació urbana (13) | — | *(none recorded)* |
| **323** | Nombre màxim d'habitatges/parcel·la (13) | 47 | **Barcelona** (p.184); **Badalona** (p.128); Santa Coloma de Gramenet (p.376) |
| **326** | Tipus d'ordenació (13) → routes to Art. 242 | — | *(none recorded)* |
| **327** | **Condicions d'edificació 13a — the alçada table** | **49** | **Badalona** (p.137); **Barcelona** (p.276) |
| **328** | **Condicions d'edificació 13b — the alçada table** | **50** | **Badalona** (p.137); **Barcelona** (p.277) |
| **330** | Edificabilitat — conservació (15) | 52 | **Badalona** (p.128) |
| **342** | Condicions d'edificació subzones plurifamiliars (20a/*) | 55 | **Barcelona** (p.179); Cerdanyola del Vallès (p.281); **Badalona** (p.129); Santa Coloma de Gramenet (p.377) |
| **343** | Condicions d'edificació subzones unifamiliars (20a/*) | 56 | **Barcelona** (p.181); Cerdanyola del Vallès (p.281); **Badalona** (p.133) |
| **345** | Edificabilitat — edificació aïllada (20a) | — | *(none recorded)* |
| **350** | Condicions d'edificació — remodelació pública (14a) | — | *(none recorded)* |
| **355** | Tipus d'ordenació — remodelació privada (14b) | — | *(none recorded)* |
| **356** | Estàndards urbanístics (14b) | 57 | **Barcelona** (p.151) |
| **357** | Edificabilitat (14b) | 58 | **Barcelona** (p.151) |
| **358–362** | Condicions (14b); zona 16 definició/ordenació/edificabilitat | — | *(none recorded)* |
| **363** | Densitat d'habitatges (16) | 59 | **Barcelona** (p.187); **Badalona** (p.129) |
| **364–368** | Zona 16 exigències/condicions/conservació; zona 17 | — | *(none recorded)* |

Adjacent articles the same apparatus covers, for completeness:
**317**/fn 44 and **318**/fn 45 → Barcelona p.184, Badalona p.128, Santa Coloma p.375 ·
**325**/fn 48 → Barcelona p.184, Badalona p.128, Santa Coloma p.376 ·
**329**/fn 51 → Barcelona p.184, Badalona p.128 ·
**336**/fn 53 → Barcelona p.185, Badalona p.129, Santa Coloma p.376 ·
**341**/fn 54 → Barcelona p.185, Badalona p.129, Santa Coloma p.377 ·
**225**/fn 9 → Barcelona p.151, **L'Hospitalet p.323**, Santa Coloma p.362, Badalona p.136, Sant Adrià p.338, Cerdanyola p.282 ·
**296**/fn 30 → **L'Hospitalet p.324**, Barcelona p.147, Badalona p.125, Sant Just Desvern p.357 ·
**298**/fn 31 → Barcelona p.147, **L'Hospitalet p.324**, Ripollet p.338, Santa Coloma p.364, Badalona p.125, Cerdanyola p.292, Gavà p.320 ·
**300**/fn 33 → Barcelona p.149, Santa Coloma p.364, Gavà p.320 ·
**239**/fn 14 → Cerdanyola p.282, Badalona p.138, **Barcelona p.273** ·
**264**/fn 25 → Barcelona p.278.

---

## 5. ⚠⚠⚠ FINDING THAT NEEDS THE FOUNDER: Barcelona's OWN Art. 327/328 are modified

This is the most consequential thing the scope map turned up, and it is about **Barcelona**, not
about the extension.

`bcnAlcadaReguladora.ts` (lines 23–25) records, as settled:

> *"The whole table was independently corroborated band-for-band (all six) against a consolidated
> PGM text that flags its own local rewrites and **carries none on this article**."*

**Footnote 49 on Art. 327 carries two, and one of them is Barcelona.** The instrument it points at
(PDF p.274, printed p.273) is:

> «**Modificació de les Normes urbanístiques del Pla General Metropolità per a la modificació de les
> alçades reguladores en el tipus d'ordenació segons alineació de vial, al terme muncipal de
> Barcelona.** Aprovada definitivament per la Subcomissió d'Urbanisme del Municipi de Barcelona, en
> la sessió de **2 de març de 2007**. (DOGC núm. **4893** de **29/05/2007**).»

and at PDF p.277 it restates **Art. 327.2a** as:

| Ample de vial | Alçada màxima | Nombre màxim de plantes |
|---|---|---|
| De menys de 8 m | **9,00 m** | PB + 1 pis |
| De 8 m a menys de 12 m | **12,35 m** | PB + 2 pisos |
| De 12 m a menys de 15 m | **15,70 m** | PB + 3 pisos |
| De 15 m a menys de 20 m | **19,05 m** | PB + 4 pisos |
| De 20 m a menys de 30 m | **22,40 m** | PB + 5 pisos |
| De 30 m o més | **25,75 m** | PB + 6 pisos |

The **base / metropolitan** Art. 327 table (PDF p.108) is a *different* ladder:
**8,55 / 11,60 / 14,65 / 17,70 / 20,75 / 23,80 m**, PB+1…PB+6, at **3,05 m** per storey.

**PRYZM ships the base table for Barcelona.** (`BCN_ALCADA_REGULADORA_TABLE`.)

### What this does and does not mean

* `EXTRACTION-PROTOCOL.md` Step 4 rejected the 9,00/…/25,75 table as *"never located in the accepted
  source"*. **It is now located, in the primary source, at PDF p.277.** The rejection was right to
  refuse an unlocated number; the number was nonetheless real.
* The protocol also attributed it to *"3,35 m per floor"* and contrasted it with *"the generic PGM at
  3,05 m/floor"*. Both figures appear **in the same article**: the modified Art. 327 keeps
  «L'alçada mínima de les plantes … serà de **3,05 m**» as a **storey MINIMUM** while stepping the
  bands by 3,35 m. The two were never rivals — one is a band ladder, the other a floor-to-floor
  minimum.
* **Badalona's own modification (PDF p.138) states the SAME six values.** So the 3,35 ladder is in
  force in at least two municipalities — by **two separate municipal instruments**, each cited to
  its own municipality. It is *not* metropolitan.

> **⇒ Open question for the founder, deliberately NOT actioned here.** If the 2007 modification is
> in force, Barcelona's shipped 13a/13b heights are the **superseded metropolitan** ones and
> understate by roughly one storey's worth of height at every band. Confirming that is a legal act
> (L-449), and it needs the **binding DOGC 4893 text**, not this non-official compendium (§3.2).
> **Nothing in Barcelona was changed by this task.**
>
> The irony worth stating plainly: the numbers PRYZM currently ships for Barcelona are the correct
> **metropolitan** ones — they are just possibly the wrong ones *for Barcelona*.

---

## 6. What this means for each registered municipality

### 6.1 L'Hospitalet de Llobregat (`es-08101-hospitalet`)

Named in the base footnotes **only** on **Art. 29** (actuació poligonal), **Art. 225** (habitatge en
planta baixa), **Arts. 296 / 298 / 299 / 300** (aparcaments). Its annex section (PDF pp. 324–330) is
parking, ground-floor housing, and *habitatges dotacionals per a joves* (clau 10hj).

> **No zone/envelope article — 306, 314, 316, 320, 322, 323, 326, 327, 328, 330, 342, 343, 345,
> 350, 355–368 — carries an L'Hospitalet modification anywhere in this compendium.**

### 6.2 Cornellà de Llobregat (`es-08073-cornella-de-llobregat`)

Appears in **zero** base-article footnotes. Its annex section (PDF pp. 294–303) is a site-specific
requalification (cinema Avenida, clau 7 → dotacions comercials) and *habitatge dotacional públic* —
neither touches a base zone article, which is exactly why no footnote points at it.

### 6.3 Sant Boi de Llobregat (`es-08200-sant-boi`)

The **weakest** presence of the four. It appears in the compendium **once**, and only inside a
**joint, four-municipality systems modification**:

> «**Modificació puntual del Sistema Aeroportuari del PGM, als termes municipals del Prat de
> Llobregat, Sant Boi de Llobregat, Viladecans i Gavà.** Aprovada definitivament per Acord del
> Govern de la Generalitat de 6 de març de 2001 (DOGC núm. 3361 de 03/04/01).» *(PDF p.383)*

That is a **sistema general** (Arts. 186–190), not a zone. Sant Boi has **no standalone modification
section** at all.

### 6.4 Badalona (`es-08015-badalona`)

The **most heavily modified** AMB municipality after Barcelona. Within the transcribed set it
rewrites **Arts. 238, 242, 320, 323, 327, 328, 330, 342, 343, 363** — and beyond it, 225, 229, 231,
249–253, 278/279, 296, 298, 317/318/325/329/336/341.

Concretely: Badalona has **its own alçada tables for both 13a and 13b** (PDF p.138), **adds
subapartats c/d/e to Art. 242.8** (PDF p.136 — the depth construction), and rewrites the **20a
subzone quadres** (PDF pp. 133–135: e.g. subzones VI–IX at **9,15 m**, separations
5/3/5 · 8/5/8 · 12/10/12 m, reduced *índex* 0,75 m²st/m²s above 200 m² parcel and 10 m façana).

Its governing instrument for most of that is:

> «**Modificació puntual de les Normes Urbanístiques del Pla General Metropolità en l'àmbit del
> municipi de Badalona.** Aprovada definitivament pel conseller de Política Territorial i Obres
> Públiques el **6 de Juny de 2008**. (DOGC núm. **5224** de **29/09/2008**).» *(PDF p.126)*

> **⇒ Badalona is the LAST AMB municipality whose numbers may be borrowed from anywhere.** The
> current refusal is not merely right, it is understated.

---

## 7. Verdict per municipality — and why nothing was promoted

| Municipality | Envelope articles rewritten? | Verdict |
|---|---|---|
| **Badalona** | **Yes — 238, 242, 320, 323, 327, 328, 330, 342, 343, 363** | **REFUSAL STANDS.** Its own tables exist and differ. Borrowing would be a mis-citation *and* a wrong number. |
| **L'Hospitalet** | None recorded (parking / planta baixa only) | **REFUSAL STANDS** — on the §7.1 blocker, not on "Barcelona's tables are Barcelona's". |
| **Cornellà** | None recorded at all | **REFUSAL STANDS** — same blocker. |
| **Sant Boi** | None recorded (airport system only) | **REFUSAL STANDS** — same blocker, plus the thinnest evidence base of the four. |

### 7.1 The ONE blocker, named precisely *(EXTRACTION-PROTOCOL Step 5)*

For L'Hospitalet, Cornellà and Sant Boi the metropolitan Art. 327/328 tables are the best available
reading of the law. They still cannot be shipped, and **the reason is not the ordinance**:

> **Art. 327.2 keys the table to the *ample oficial del carrer* — the officially *declared* street
> width — and PRYZM holds an official-width source for BARCELONA ONLY**
> (`bcnOfficialStreetWidths.ts`; and even there the CKAN probe of 2026-07-21 found no
> machine-readable width layer, so the module refuses near band edges).

The bands are **steps**: at the 20 m edge, 19.99 m ⇒ 17,70 m / PB+4 and 20.00 m ⇒ 20,75 m / PB+5.
A centimetre of measurement noise moves a building a whole storey. Handing L'Hospitalet a
GIS-measured frontage gap would fabricate a height with the *shape* of a legal answer — the L-459 /
L-525a defect class.

**So the height stays `null` — UNKNOWN, not `0`, not "no limit".**

### 7.2 What *would* transfer, and why it was still not registered

The **Art. 242.2 depth construction** (ADR-0271, `block-derived-alignment`) is genuinely
metropolitan: no footnote names L'Hospitalet, Cornellà or Sant Boi on Art. 242, and the rule derives
depth from the **real cadastral block**, not from a municipal table — so its geometry needs no local
data. Art. 326 (which routes 13a/13b to it) and Art. 322 (**NOT-THE-RULE-KIND**: «l'edificabilitat
es defineix per l'envolupant màxima de volum» ⇒ `farRatio` is `null` **by design**) are likewise
unmodified there.

A depth-only pack under the metropolitan citation is therefore *defensible*. It was **not** authored,
for three reasons, in order of weight:

1. **§3.1.** The source cannot certify "unmodified" — only "no modification recorded". Shipping a
   number on that basis promotes an absence into an assertion, which is the exact move this
   codebase's honesty rules exist to block.
2. **A depth-only envelope is not a partial answer, it is an unbounded one.** With `maxHeight_m`
   null, the massing has a footprint and no ceiling. L-616 is the precedent: a solid that ignores
   one derived constraint over-stated by ~5×. Shipping depth without height on land whose height we
   cannot key is that failure mode, pre-built.
3. **A refusal is a correct answer** — and it is the answer the evidence supports today.

**What would unblock it:** an *ample oficial* source for the municipality (municipal *text refós* or
street-section database), **or** a founder ruling that the metropolitan table may be applied to a
measured width with an explicit band-edge refusal. Either is a one-input change, not a research
programme.

---

## 8. AMB municipalities: which are even in scope

The compendium's **Modificacions** annex is organised by municipality, and its section list is the
best available enumeration of PGM municipalities that have modified the plan (PDF page ranges):

| Municipality | PDF pp. | PRYZM |
|---|---|---|
| Badalona | 126–145 | registered (refusal) |
| Barcelona | 146–280 | registered (packs) |
| Castelldefels *(spelt "Castelldefells")* | 281 | — |
| Cerdanyola del Vallès | 282–294 | — |
| Cornellà de Llobregat | 294–303 | registered (refusal) |
| El Prat de Llobregat | 303–304, 383–385 | — |
| Esplugues de Llobregat | 304–316 | — |
| Gavà | 317–324, 383–385 | — |
| L'Hospitalet de Llobregat | 324–330 | registered (refusal) |
| Montcada i Reixac *(spelt "Motcada")* | 330–333 | — |
| Papiol | 333–338 | — |
| Ripollet | 339 | — |
| Sant Adrià del Besòs | 339–341 | — |
| Sant Boi de Llobregat | 383–385 *(joint only)* | registered (refusal) |
| Sant Cugat del Vallès | 341–356 | — |
| Sant Joan Despí | 357–358 | — |
| Sant Just Desvern | 358–363 | — |
| Santa Coloma de Gramenet | 363–380 | — |
| Viladecans | 381–385 | — |
| Pallejà | 496 | — |

That is **20 municipalities**. The PGM's territory is the **27**-municipality EMMB, so ~7 PGM
municipalities recorded no "most relevant" modification; and the AMB's **36** means **~9 AMB
municipalities are outside the PGM entirely**.

### ⚠ NOT MEASURED: the buildable-land ranking

The brief asked for AMB municipalities ranked by buildable-land share, measured from
`qualificacio_refos_3857/MapServer/16` (`QU_Trames`, `CODI_INE`, `outStatistics` sum of
`SHAPE_Area` grouped by `CLAU_URB`). **This was started and is NOT complete — do not treat any
ranking as delivered.** The one substantive thing learned before it stopped:

> The layer returns **426 distinct `CLAU_URB` values** — far more than a PGM clau alphabet.
> The non-PGM AMB municipalities carry their **own POUM clau alphabets** in the same field, so a
> buildable/non-buildable classification built from the PGM clau list would **mis-classify every
> non-PGM municipality**. The layer also exposes `CS`, `DGU`, `SINTETIC` and `DESCRIP` fields, which
> look like the right basis for a *harmonised* classification instead of a hand-written clau list.

Anyone completing this should classify from the harmonised field, not from clau strings, and should
report the classification alongside the ranking so it is auditable.

---

## 9. What is still UNKNOWN

1. **Whether the 2007 Barcelona alçada modification is in force** (§5). Needs the binding DOGC 4893
   text. This is the highest-value open item in the whole dossier.
2. **Whether any of the four municipalities has a post-2009 modification** of an envelope article.
   §3.1 + §3.3 mean this compendium cannot answer it; RPUC / the municipal *text refós* can.
3. **Which claus actually occur** in L'Hospitalet / Cornellà / Sant Boi, and at what land share.
   Unmeasured (§8).
4. **The *ample oficial* source** for any AMB municipality other than Barcelona. The single blocker
   (§7.1).
5. **The 27-municipality EMMB list** — `Decret llei 5/1974` art. 2.1 is referenced by the PGM but is
   **not reproduced** in this PDF. The 20-municipality annex list is a lower bound, not the roster.
6. **PDF pp. 196–209** (inside Barcelona's 22@ section) use a third font encoding that is not a
   uniform shift; they were not decoded. They are outside the article set above, but anyone
   extending 22@ will hit them and must raster them.

---

## 10. Not modelled, and common in the field

The metropolitan articles above regulate the envelope. Between *implantació × storeys* and real
buildable floor area sit rules with **zero corpus coverage**, all of them metropolitan and all of
them frequent: ***cossos sortints* / tribunes** (Art. 229/231 — themselves Badalona-modified),
***planta baixa*** rasant rules (Badalona's 2008 modification moves the ground-floor rasant by up to
1 m, and only for dwelling use), ***àtic* / *sotacoberta***, and ***patis de llum***. In the
densification fabric these are near-universal, so they are a live risk to *edificabilitat*, not a
theoretical one.
