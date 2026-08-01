# Barcelona (INE 08019) — Canonical Legal Corpus · INDEX

> **Purpose.** One versioned index of the *binding published instruments* that govern
> buildability in Barcelona, so that every rule pack cites **this index** instead of
> scattered PDFs, geoportal HTML pages, or the AMB compendium.
>
> **Status:** seeded 2026-08-01. Not yet complete — see `coverage` at the bottom.

---

## 0. How to read this file

Each instrument carries three orthogonal status fields. **Do not collapse them.**

### `verificationStatus` — how good is our copy of the text?

| value | meaning |
|---|---|
| `binding-text-retrieved` | We hold the text **as published in the official gazette** (or the document registered in the RPUC). Citable. |
| `re-edition-only` | We only hold a consolidation/compendium/re-edition. Useful for navigation, **not** citable as the binding text. |
| `reference-only` | We only have proof the instrument **exists** (a register row, a search hit, a cross-reference). No text. |

### `supersessionStatus` — per article, has anything later changed it?

| value | meaning |
|---|---|
| `superseded-by:<instrument>` | A later instrument demonstrably amends this article. |
| `no-later-instrument-found (<register>, <date>)` | **A SEARCH RESULT, NOT A LEGAL CONCLUSION.** We looked in the named register on the named date and found nothing. It does **not** mean nothing exists. |
| `not-checked` | We have not looked. |

### `inForce` — what the official register says today

Taken from the RPUC `vigencia` flag. This is the register's statement about the *instrument*,
not about any individual article.

> ⚠️ **`not-located-in-source` ≠ `does-not-exist`.** Every negative in this file is the former.

---

## 1. Instruments

### 1.1 PGM-1976 — the base plan

```yaml
id: PGM-1976
title: "Pla general metropolità d'ordenació urbana de l'entitat municipal metropolitana de Barcelona"
shortTitle: PGM
authority: "Corporació Metropolitana de Barcelona / Comissió d'Urbanisme"
approvalDate: 1976-07-14
publication:
  gazette: BOP Barcelona
  date: 1976-07-19
scope: "27 municipis de l'antiga Corporació Metropolitana de Barcelona (incl. 08019 Barcelona)"
articlesRelevantHere: [239, 320, 327, 328, 264, 242]
supersessionChain:
  modifies: []
  modifiedBy:
    - MPGM-2007-ALCADES-ALINEACIO-VIAL   # arts. 239, 320, 327, 328  (Barcelona only)
    - MPGM-2009-ART-264                  # art. 264                  (Barcelona only)
    - MPGM-2006-22A                      # 22@ regime
    - "…many others, not exhaustively enumerated"
verificationStatus: re-edition-only
sourceHeld: "AMB NUMAMB compendium — self-described «merament divulgativa», consolidated only to 31-12-2009, filtered for «les modificacions considerades més rellevants»"
localFile: null
note: >
  The compendium is structurally incapable of certifying an absence of amendment.
  Treat every PGM article number sourced from it as re-edition-only until the
  originating instrument is retrieved.
```

---

### 1.2 MPGM-2007-ALCADES-ALINEACIO-VIAL — **the height instrument** ✅ RETRIEVED

```yaml
id: MPGM-2007-ALCADES-ALINEACIO-VIAL
title: >
  Modificació puntual de les Normes urbanístiques del Pla general metropolità per a la
  modificació de les alçades reguladores en el tipus d'ordenació segons alineació de vial,
  al terme municipal de Barcelona
expedient: "2006 / 025790 / B"          # ← VERIFIED on the published edicte AND in the RPUC
authority: "Subcomissió d'Urbanisme del municipi de Barcelona"
competency: "Generalitat de Catalunya"
rang: "Planejament general"
approvalDate: 2007-03-02                 # sessió de 2 de març de 2007
edicteDate: 2007-05-11                   # Edicte d'11 de maig de 2007, Mercè Albiol i Núñez
publication:
  gazette: DOGC
  number: 4893
  date: 2007-05-29
  pages: "18336–18339"
  docRef: "(07.131.023)"
effectiveDate: 2007-05-30                # day after DOGC publication (executivitat)
municipality: "08019 Barcelona"          # ⚠ VERIFIED on the document itself — NOT Badalona
articlesAffected: [239, 320, 327, 328]
inForce: "SÍ (RPUC vigencia=SI, consulted 2026-08-01)"
registered: "SÍ (RPUC registrat=SI; assentament Alta, Llibre 0, núm. 872, 2007-12-20)"
verificationStatus: binding-text-retrieved
retrievalURLs:
  dogcPdf: "https://portaldogc.gencat.cat/utilsEADOP/AppJava/PdfProviderServlet?versionId=927050&type=01"
  dogcDocumentId: 446597
  rpucExpedient: "https://planejamenturbanisme.territori.gencat.cat/rpucportal/#/consulta/detallExpedient/232336"
  rpucDocumentUnitari: "https://planejamenturbanisme.territori.gencat.cat/RPUC-portal/rest/consulta/documents?documentId=147523&downloadType=1&idioma=ca"
  rpucAcord: "https://planejamenturbanisme.territori.gencat.cat/RPUC-portal/rest/consulta/documents?documentId=147522&downloadType=1&idioma=ca"
localFiles:
  - path: pdf/DOGC-4893_2007-05-29_MPGM-alcades-alineacio-vial_BARCELONA.pdf
    bytes: 200616
    sha256: 652E28D6E1108FD7AB39791934A64E6276090D58AED8E738C1ABCE9A224180AD
    contents: "Edicte (acord) + full ANNEX with the modified articles. 5 gazette pages."
  - path: pdf/RPUC_2006-025790-B_document-unitari_text-aprovacio-definitiva.pdf
    bytes: 875450
    sha256: D45F840751FB76B068B564336C61833715881BFFC6954C14222AA12B7F841C3B
    contents: >
      The REGISTERED instrument: "MODIFICACIÓ DE LES NORMES URBANÍSTIQUES DEL PGM …
      AL TERME MUNICIPAL DE BARCELONA", MARÇ 2007, TEXT APROVACIÓ DEFINITIVA,
      Ajuntament de Barcelona · Sector d'Urbanisme i Infraestructures, bearing the
      DGU stamp "Aprovat definitivament per la Subcomissió d'Urbanisme del municipi
      de Barcelona amb prescripcions d'ofici en sessió de 02 MARÇ 2007", signed
      Mercè Albiol Núñez. 13 pages, image-only (no text layer).
  - path: pdf/RPUC_2006-025790-B_acord-aprovacio-definitiva.pdf
    bytes: 61790
    sha256: FD9D9C5E23821496317478A4DAF70835345873194EE257ADFD502349F5468710
supersessionStatus:
  art239: "no-later-instrument-found (RPUC, 2026-08-01)"
  art320: "no-later-instrument-found (RPUC, 2026-08-01)"
  art327: "no-later-instrument-found (RPUC, 2026-08-01)"
  art328: "no-later-instrument-found (RPUC, 2026-08-01)"
supersessionChain:
  modifies: [PGM-1976]                   # arts. 239, 320, 327, 328
  modifiedBy: []                         # RPUC expedientsRelacionats = [] on 2026-08-01
extractionNote: >
  The DOGC PDF has NO ToUnicode map and mixes several CID offsets WITHIN a single line.
  A naïve text pass silently corrupts digits. All figures below were read from a
  200 dpi raster render (page.get_pixmap(dpi=200)), not from get_text().
```

#### Territorial scope clause — verbatim

From the acord (DOGC 4893, p. 18336):

> «*Exp.: 2006/025790/B*
> *Modificació puntual de les Normes urbanístiques del Pla general metropolità per a la
> modificació de les alçades reguladores en el tipus d'ordenació segons alineació de vial,
> **al terme municipal de Barcelona***»

and from the operative paragraph:

> «—1 Aprovar definitivament la Modificació puntual de les Normes urbanístiques del Pla
> general metropolità per a la modificació de les alçades reguladores en el tipus d'ordenació
> segons alineació de vial, **de Barcelona**, promoguda i tramesa per l'Ajuntament, tot
> incorporant d'ofici les rectificacions proposades en el document tramès per l'Ajuntament
> en data 2 de gener de 2007, i la prescripció a l'article 328 que regula la subzona 13b […]»

and the ANNEX header (p. 18337):

> «ANNEX
> *Normes urbanístiques de la Modificació de les Normes urbanístiques del Pla general
> metropolità per a la modificació de les alçades reguladores en el tipus d'ordenació segons
> alineació de vial, **de Barcelona***»

**Scope finding — CONFIRMED as previously read.** The instrument applies to the whole
*terme municipal de Barcelona*. There is **no** sector, àmbit, front-edificatori or
district restriction anywhere in the acord or the annex, and the acord contains only two
operative points (—1 approve, —2 authorise publication). **No transitional regime
(disposició transitòria) appears in the published text.**

The annex is styled: «*Modificació de l'articulat: articulat proposat. En negreta, text
afegit o modificat.*» — i.e. it republishes each article in full with the changed wording
in bold.

#### Structure of the annex (as published)

```
Títol IV. Reglamentació detallada del sòl urbà
  Capítol 2n. De les disposicions comunes als tipus d'ordenació
    Secció 2a. Normes aplicables a l'edificació segons alineació de vial
      Art. 239.- Alçada
  Capítol 4t. Zones
    Secció 2a. Zona de nucli antic (12)
      Art. 320.- Condicions d'edificació
    Secció 3a. Zona de densificació urbana: subzona I, intensiva, i subzona II, semiintensiva (13)
      Art. 327.- Condicions d'edificació: subzona I, intensiva (13a)
      Art. 328.- Condicions d'edificació: subzona II, semiintensiva (13b)
```

#### Art. 327.2a — clau 13a · **CONFIRMED, no correction needed**

Read from the 200 dpi raster of DOGC 4893 p. 18338.

> «L'alçada reguladora màxima i el nombre màxim de plantes es determinen en funció de
> l'ample del vial a què doni front l'edificació, d'acord amb el quadre següent:»

| Ample de vial | Alçada màxima | Nombre màxim de plantes |
|---|---|---|
| De menys de 8 m | **9,00 m** | PB + 1 pis |
| De 8 m a menys de 12 m | **12,35 m** | PB + 2 pisos |
| De 12 m a menys de 15 m | **15,70 m** | PB + 3 pisos |
| De 15 m a menys de 20 m | **19,05 m** | PB + 4 pisos |
| De 20 m a menys de 30 m | **22,40 m** | PB + 5 pisos |
| De 30 m o més | **25,75 m** | PB + 6 pisos |

> «**L'alçada reguladora màxima i el nombre de plantes establerts al quadre anterior
> s'hauran de respectar conjuntament.**»

**All six rows match the AMB compendium exactly. Zero corrections.**

#### Art. 328.2a — clau 13b · **CONFIRMED, no correction needed**

Read from the 200 dpi raster of DOGC 4893 p. 18339.

| Ample de vial | Alçada màxima | Nombre màxim de plantes |
|---|---|---|
| De menys de 8 m | **8,25 m** | PB + 1 pis |
| De 8 m a menys d'11 m | **12,00 m** | PB + 2 pisos |
| D'11 m a menys de 15 m | **15,40 m** | PB + 3 pisos |
| De 15 m endavant | **18,80 m** | PB + 4 pisos |

> «**L'alçada reguladora màxima i el nombre de plantes establerts al quadre anterior
> s'hauran de respectar conjuntament.**»

**All four rows match the AMB compendium exactly. Zero corrections.**

This table is stated **twice** in the same publication — once in the acord (p. 18336, as the
*prescripció d'ofici* to art. 328) and once in the annex (p. 18339). The two are identical.

#### Art. 320.3a — clau 12 (nucli antic, subzona I) · **NEW — not previously held**

Read from the 200 dpi raster of DOGC 4893 p. 18337. Applies to *subzona I, de substitució
de l'edificació antiga*.

| Ample de vial | Alçada reguladora màxima | Nombre màxim de plantes |
|---|---|---|
| De menys de 8 m | **7,90 m** | PB i 1 pis |
| De 8 m a menys de 12 m | **11,25 m** | PB i 2 pisos |
| De 12 m a menys de 15 m | **14,60 m** | PB i 3 pisos |
| De 15 m endavant | **17,95 m** | PB i 4 pisos |

For *subzona II, de conservació del centre històric*, art. 320.3a sets no table:

> «A la subzona II, de conservació del centre històric, l'alçada en un tram de vial serà la
> mitjana de les edificacions existents, sense que entrin en el còmput les façanes dels solars
> no edificats. El nombre màxim de plantes admès serà, un cop fet el còmput de l'alçada, el
> que resulti per defecte de suposar una alçada mínima de planta baixa de quatre metres (4 m)
> i una alçada mínima, inclosos forjat i paviment, per planta pis, de tres metres cinc
> centímetres (3,05 m).»

#### The 3,05 m storey minimum · **CONFIRMED UNCHANGED**

The figure appears three times in the published annex and is **3,05 m** in every instance:

- **Art. 320.3a (clau 12, subzona I)** — «L'alçada total mínima, inclòs el forjat, serà per
  planta pis de tres metres cinc centímetres (3,05 m). **No s'admetrà la construcció
  d'entresolats en planta baixa.**»
- **Art. 327.2a (clau 13a)** — «L'alçada mínima de les plantes, inclosos els forjats i el
  paviment, serà de 3,05 m. L'alçada **mínima** de la planta baixa es regirà per allò
  establert a les disposicions comunes per al tipus d'ordenació segons alineacions de vial.»
- **Art. 328.2a (clau 13b)** — «**L'alçada total mínima, inclosos forjat i paviment, serà de
  tres metres cinc centímetres (3,05 m).**»

Related minima also captured, for completeness:
- clau 12 subzona I planta baixa free height: **4 m** (reducible to **3,30 m** for
  *habitatges unifamiliars*), measured «sobre la cota de referència de l'alçada reguladora
  a què es refereix l'article 225-2», *sense incloure-hi el gruix del forjat*.
- clau 13a interior d'illa free height cap: **4,50 m**.
- clau 13b interior d'illa free height cap: **3,30 m**.

#### Art. 239 — Alçada (general rules for *alineació de vial*)

Retrieved in full. Paragraph 3 is the one materially changed (bolded additions):

> «3. Per sobre de l'alçada reguladora màxima **o, si és el cas, sobre el pla superior de
> l'últim forjat**, només es permetran: […]»

with (a) cobertes terminals ≤30 % pendent; (b) cambres d'aire / elements de coberta, total
≤ **60 cm**; (c) baranes de façana ≤ **1,80 m**, «*encara que restarà, en tot cas, limitada
per les cotes de coronament dels edificis veïns*»; (d) separadors entre terrats
≤ **1,80 m** opaque / ≤ **2,50 m** transparent; (e) elements tècnics d'instal·lacions
«*situats dintre del gàlib definit per un pla que formi un angle de 30° respecte del pla
horitzontal*», màx **3,50 m**; (f) remats decoratius de les façanes.

---

### 1.3 MPGM-2009-ART-264

```yaml
id: MPGM-2009-ART-264
title: >
  Modificació de l'article 264 de les Normes urbanístiques del Pla general metropolità,
  localització relativa de l'edificació, tipus d'ordenació segons volumetria específica
expedient: "2009 / 036679 / B"
authority: "Subcomissió d'Urbanisme del municipi de Barcelona"
competency: "Generalitat de Catalunya"
rang: "Planejament general"
approvalDate: 2009-07-22                 # RPUC dataAprovacio — matches the prior record
publication:
  gazette: DOGC
  number: 5509                            # prior record; consistent with the RPUC date
  date: 2009-11-19                        # RPUC dataPublicacio
municipality: "08019 Barcelona"
articlesAffected: [264]
inForce: "SÍ (RPUC vigencia=SI, consulted 2026-08-01)"
verificationStatus: reference-only        # register row retrieved; text NOT yet downloaded
retrievalURLs:
  rpucDocumentUnitari: "https://planejamenturbanisme.territori.gencat.cat/RPUC-portal/rest/consulta/documents?documentId=200126&downloadType=1&idioma=ca"
  rpucAcord: "https://planejamenturbanisme.territori.gencat.cat/RPUC-portal/rest/consulta/documents?documentId=200127&downloadType=1&idioma=ca"
localFile: null
supersessionStatus:
  art264: "no-later-instrument-found (RPUC, 2026-08-01)"
supersessionChain:
  modifies: [PGM-1976]                   # art. 264
  modifiedBy: []                         # RPUC expedientsRelacionats = []
correction: >
  The prior repo record cited "22-07-2009, DOGC 5509" as if one date. The register
  separates them: APPROVED 2009-07-22, PUBLISHED 2009-11-19 (DOGC 5509). Both are
  correct; they are different events. Use the publication date for effectiveness.
```

---

### 1.4 MPGM-2006-22A — 22@ re-approval

```yaml
id: MPGM-2006-22A
title: >
  Modificació puntual del Pla general metropolità per a la renovació de les àrees
  industrials del Poblenou — Districte d'activitats 22@bcn
expedient: "2005 / 020925 / B"
authority: "Subcomissió d'Urbanisme del municipi de Barcelona"
competency: "Generalitat de Catalunya"
rang: "Planejament general"
approvalDate: 2006-03-01                 # RPUC — CONFIRMS the prior record
publication:
  gazette: DOGC
  number: 4654
  date: 2006-06-14                        # RPUC dataPublicacio — CONFIRMS the prior record
municipality: "08019 Barcelona"
inForce: "SÍ (RPUC vigencia=SI, consulted 2026-08-01)"
verificationStatus: reference-only
predecessor:
  id: MPGM-2000-22A
  expedient: "2000 / 001080 / B"
  approvalDate: 2000-07-27
  publicationDate: 2000-10-05
  note: "the original 22@ MPGM; also vigent per RPUC"
retrievalURLs:
  rpucDocumentUnitari: "https://planejamenturbanisme.territori.gencat.cat/RPUC-portal/rest/consulta/documents?documentId=126505&downloadType=1&idioma=ca"
localFile: null
supersessionStatus:
  "22@ regime": "not-checked"
relatedLaterInstrument:
  id: MPGM-2025-22A-INCLUSIU
  expedient: "2024 / 082320 / B"
  title: "Modificació puntual de la MPGM per un 22@ més inclusiu i sostenible per a la modificació i ajust de les Normes Urbanístiques"
  publicationDate: 2025-03-21
  note: "AMENDS 22@ Normes Urbanístiques. Does NOT, on its title, touch arts. 239/320/327/328 — but this has not been verified against its text."
alsoAvailable:
  bcnrocDogcPdf: "https://bcnroc.ajuntament.barcelona.cat/jspui/bitstream/11703/139998/1/DOGC_pla-metropolita-22arroba_2025.pdf"
  bcnrocStatus: "HTTP 403 (F5 'Request Rejected') on 2026-08-01 — see RETRIEVAL-LOG.md"
```

---

### 1.5 ORD-2002-EIXAMPLE — *Ordenança de rehabilitació i millora de l'Eixample*

```yaml
id: ORD-2002-EIXAMPLE
title: "Ordenança de rehabilitació i millora de l'Eixample"
authority: "Ajuntament de Barcelona (municipal ordinance, not a planning instrument)"
approvalDate: 2002
publication: { gazette: "BOP Barcelona / Gaseta Municipal", number: null, date: null }
municipality: "08019 Barcelona"
inForce: UNKNOWN
verificationStatus: reference-only
retrievalURLs:
  bcnroc: "https://bcnroc.ajuntament.barcelona.cat/jspui/handle/11703/89247"
  bcnrocStatus: "NOT REACHED — host returned HTTP 403 anti-bot on every path, 2026-08-01"
localFile: null
supersessionStatus:
  whole: "not-checked"
openQuestion: >
  Two 2015 «Derogació» rows were seen in an earlier session and have never been reached.
  Until they are, this ordinance's force is UNKNOWN — do not rely on it in a rule pack.
  It is an ORDINANCE, not planning: it does not appear in the RPUC, so RPUC silence about
  it is not evidence. Correct register is the municipal one (Gaseta Municipal / CIDO).
```

---

### 1.6 MPGM-2008-BADALONA — ⚠️ **NOT BARCELONA. DO NOT SUBSTITUTE.**

Indexed here **solely as a disambiguation exhibit**, because these two instruments have
already been confused once in our own protocol document.

```yaml
id: MPGM-2008-BADALONA
title: "Modificació puntual de les Normes urbanístiques del Pla general metropolità, al terme municipal de Badalona"
expedient: "2007/028428/B"               # ← THIS IS BADALONA'S EXPEDIENT
authority: "Conseller de Política Territorial i Obres Públiques (resolució)"
approvalDate: 2008-06-06                  # "ha resolt, en data 6 de juny de 2008"
edicteDate: 2008-07-25
publication:
  original:   { gazette: DOGC, number: 5189, date: 2008-08-06, page: 61333 }
  republished:{ gazette: DOGC, number: 5224, date: 2008-09-29, page: "70883 ff" }
  republicationReason: >
    CORRECCIÓ D'ERRADES — "Havent observat errades al text original català … es torna a
    publicar tot l'Edicte." The DOGC 5224 text is a FULL RE-PUBLICATION, so it, not
    DOGC 5189, is the operative text to read.
municipality: "08015 BADALONA"            # ⚠⚠ NOT 08019
articlesAffected: [229, 327, 328, "…"]
verificationStatus: binding-text-retrieved
localFile:
  path: pdf/DOGC-5224_2008-09-29_MPGM-BADALONA-correccio-errades_NOT-BARCELONA.pdf
  bytes: 392484
  sha256: 332E59969E0F907C3E057E2530B089DEB76450F3C533C9D9C199E1B9C19AAFE9
```

**Why this matters.** Badalona's art. 327.2a and art. 328.2a state **numerically identical
tables** to Barcelona's (9,00 / 12,35 / 15,70 / 19,05 / 22,40 / 25,75 and
8,25 / 12,00 / 15,40 / 18,80), and the same 3,05 m storey minimum. Verified on the
200 dpi raster of DOGC 5224 p. 70895.

They are nevertheless **two independent instruments for two different municipalities**,
approved by **different bodies** on **different dates**:

| | Barcelona | Badalona |
|---|---|---|
| Expedient | **2006/025790/B** | **2007/028428/B** |
| Approving body | Subcomissió d'Urbanisme del municipi de Barcelona | Conseller de PTOP (resolució) |
| Approval date | 2007-03-02 | 2008-06-06 |
| Publication | DOGC 4893, 29-05-2007 | DOGC 5189, 06-08-2008 → re-published DOGC 5224, 29-09-2008 |
| Articles | 239, 320, 327, 328 | 229, 327, 328, … |
| 13b interior d'illa | 3,30 m | **3,75 m** |

> **The values coinciding is not evidence about either.** Cite Barcelona's from
> DOGC 4893 and Badalona's from DOGC 5224 — never one for the other.

**Resolved provenance bug:** the expedient `2007/028428` that a prior repo record
attributed to the Barcelona instrument is **Badalona's**. Barcelona's is `2006/025790/B`.
This is the same class of error as reading a citation off geoportal page `08015`
(Badalona's INE code) and filing it under Barcelona.

There is also a *separate* Badalona height instrument — expedient `2006/025449/M`,
approved 2007-03-09, published 2007-04-17, *«referent a l'aplicació de les alçades
reguladores en l'àmbit de les zones 14 del barri de la Salut»* — which is site-specific and
is **a third distinct thing**. Three documents, all about *alçades reguladores*, all in
2007–2008, two of them Badalona's.

---

## 2. Supersession verification record

```yaml
verification:
  question: "Were Arts. 239, 320, 327 or 328 modified after the 2 March 2007 MPGM?"
  consulted:
    - "RPUC — Registre de planejament urbanístic de Catalunya (official register), https://planejamenturbanisme.territori.gencat.cat/rpucportal/"
    - "DOGC — Diari Oficial de la Generalitat de Catalunya (official gazette), https://portaldogc.gencat.cat/"
    - "AMB NUMAMB (consultation consolidation) — NOT REACHED, HTTP 403"
  consultationDate: 2026-08-01
  result: NOT_VERIFIED
  finding: not_found
  legalMeaning: "This is a NOT-FOUND result."
  itDoesNotMean: "That no later modification exists."
  confidence: medium
```

### What was actually done

The RPUC is the authoritative register. **AMB NUMAMB is explicitly not the legal
authority** — the AMB itself describes it as a *consulta* consolidation, and the binding
documents are the approved planning instruments. No NUMAMB result was allowed to stand in
for a register result (and in any case NUMAMB was unreachable, see `RETRIEVAL-LOG.md`).

Progress on the amendment-chain enumeration:

| step | result |
|---|---|
| Barcelona (08019) planning instruments in RPUC, all dates | **1 755** enumerated |
| …of which dated after 2007-03-02 | **773** |
| …of which are PGM-level (`Modificació de pla general d'ordenació` / normes — i.e. *capable* of amending PGM normative articles) | **147** |
| …screened by title for height / alignment / *normes urbanístiques* / article keywords | **9** flagged |
| …of the 9, opened and read article-by-article | **0** |
| RPUC record for the 2007 instrument itself: `vigencia` | **SÍ (in force)** |
| RPUC record for the 2007 instrument itself: `expedientsRelacionats` | **`[]` (empty)** |
| RPUC `assentaments` for the 2007 instrument | one only — *Alta*, Llibre 0, núm. 872, 2007-12-20. **No later *Baixa* or *Modificació* entry.** |

The 9 title-flagged post-cutoff PGM-level instruments were:

| published | expedient | title (abridged) |
|---|---|---|
| 2007-05-29 | 2006/025790/B | *— the instrument itself —* |
| 2007-06-01 | 2007/027327/B | UA 5 Hostafrancs (site-specific) |
| 2008-02-13 | 2007/026456/B | ajust d'alineacions, c/ Mont d'Orsà 22, Vallvidrera (site-specific) |
| 2009-11-19 | 2009/036679/B | **modificació de l'article 264** |
| 2013-06-26 | 2012/049294/B | concreció d'alineacions, c/ Joncar i Ramon Turró (site-specific) |
| 2018-10-16 | 2018/067099/B | **Normes urbanístiques del PGM que regulen els aparcaments** |
| 2024-02-20 | 2023/080788/B | **Normes Urbanístiques del PGM — sistema d'equipaments comunitaris** |
| 2024-05-27 | 2024/082577/B | reserva de vial Vallvidrera–Can Caralleu (site-specific) |
| 2025-03-21 | 2024/082320/B | **MPGM 22@ més inclusiu — modificació i ajust de les Normes Urbanístiques** |

None of the four general-normative ones (264 · aparcaments · equipaments · 22@) names
arts. 239/320/327/328 in its title. **That is a title screen, not a text check.**

### Why this is `NOT_VERIFIED` and not `NONE`

Certifying an absence requires opening all 147 post-cutoff PGM-level instruments and
testing each for whether it amends arts. 239/320/327/328. That was not done. It is an
**amendment-chain problem, not an article-reading problem**, and 0 of 147 were read.

Additional reasons not to upgrade the claim:

- RPUC `expedientsRelacionats` was `[]` — but an empty relation graph may mean *"no
  relation recorded"* rather than *"no relation exists"*. The register does not
  systematically model article-level amendment as a relation (the art. 264 instrument
  also shows `[]`, yet it demonstrably amends PGM-1976).
- The AMB compendium — consolidated only to 31-12-2009, filtered for
  *«les considerades més rellevants»*, self-described *«merament divulgativa»* — cannot
  support an absence claim and was not used for one.
- Municipal-level instruments (ordinances, *Pla especial*) can constrain heights without
  amending these PGM articles. Not in scope of this check.

**Do not write `laterModifications: none` anywhere on the strength of this file.**

### What would justify `NONE FOUND`

Open all 147, extract each one's *articulat modificat* list, and assert the union does not
intersect {239, 320, 327, 328}. All 147 are downloadable from the RPUC via
`/RPUC-portal/rest/consulta/documents?documentId=<id>&downloadType=1&idioma=ca`, so this
is mechanically tractable — see `RETRIEVAL-LOG.md` §4 for the working API recipe.

---

## 3. Coverage

| claus | article | binding text held? | source |
|---|---|---|---|
| 12 (nucli antic) | 320.3a | ✅ yes | DOGC 4893 |
| 13a | 327.2a | ✅ yes | DOGC 4893 |
| 13b | 328.2a | ✅ yes | DOGC 4893 |
| all *alineació de vial* | 239 | ✅ yes | DOGC 4893 |
| volumetria específica | 264 | ❌ register row only | RPUC 2009/036679/B |
| 22@ | — | ❌ register row only | RPUC 2005/020925/B |
| 13E | — | ❌ register row only | RPUC 2000/002253/B (aprov. 2000-12-12, publ. 2001-01-30, *«creació de la qualificació 13E, Eixample»*) |
| everything else | — | ❌ | AMB compendium (`re-edition-only`) |

**Next highest-value retrievals**, in order:
1. `2009/036679/B` art. 264 — one download, closes a whole clau family.
2. `2000/002253/B` clau 13E creation — the only instrument that defines 13E.
3. The 147-instrument amendment-chain sweep (upgrades §2 from `NOT_VERIFIED`).
4. `ORD-2002-EIXAMPLE` + its two 2015 *Derogació* rows, via the municipal register.

---

## 4. Change log

| date | change |
|---|---|
| 2026-08-01 | Seeded. DOGC 4893 annex retrieved in full; arts. 239/320/327/328 confirmed; expedient corrected to `2006/025790/B`; Badalona instrument retrieved and firewalled; supersession recorded as `NOT_VERIFIED / not_found`. |
