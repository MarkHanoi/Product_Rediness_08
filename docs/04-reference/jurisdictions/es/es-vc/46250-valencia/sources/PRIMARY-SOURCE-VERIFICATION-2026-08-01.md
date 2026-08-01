# PRIMARY-SOURCE VERIFICATION — València (INE 46250) PGOU *Normas Urbanísticas*

**Date:** 2026-08-01 · **Status:** primary text **OBTAINED AND READ**. Envelope gate **`false`**.

> Shape follows [`../../../es-mc/30030-murcia/sources/VERIFICATION.md`](../../../es-mc/30030-murcia/sources/VERIFICATION.md).
> This file records **what was checked against the document**, not what was assumed. Verifying a
> SOURCE is not certifying its NUMBERS, and neither is a signature (L-449).

---

## 1 — The document, and its authority status stated honestly

| | |
|---|---|
| **Title** | *PLAN GENERAL DE ORDENACION URBANA — NORMAS URBANISTICAS* |
| **Authority furniture** | **"AYUNTAMIENTO DE VALENCIA / OFICINA MUNICIPAL DEL PLAN"** on every page |
| **Colophon** | *"Valencia, mayo de 1991. Por el Equipo Redactor: Alejandro Escribano Beltrán. Arquitecto Director."* |
| **Retrieved** | `https://www.valencia.es/documents/20142/629631/10.+Normas+Urbanísticas.+(Transcripción).pdf/ba78c368-ab86-c719-b9c4-e504111b3863` — **HTTP 200**, 435 440 bytes, `application/pdf`, born-digital (full text layer), 157 pp |
| **Publisher** | the **municipality itself** (`valencia.es`) |

### ⚠ THE AUTHORITY CAVEAT, AND IT IS NOT SMALL

The file the municipality publishes is titled **"(Transcripción)"** — a **transcription**, not a
scanned signed original. It carries no *«sin valor normativo»* disclaimer (checked: the strings
*«sin valor normativo»* and *«valor normativo»* appear **zero** times), and it is published by the
competent authority on its own domain. But a transcription is, by its own label, a re-keying.

**A second, independent copy was also retrieved and it is the STRONGER artefact:**

- `https://mediambient.gva.es/auto/urbanismo/reg-planeamiento/4 VALENCIA/46250 VALENCIA/1 P. GENERAL/46250-1001 1991-0010 PG TEXTO REFUNDIDO/3 NORMATIVA/46250-1001 1991-0010  NORMAS URB.pdf`
  — **HTTP 200, 11 796 297 bytes.** This is the **Generalitat Valenciana's Registro Autonómico de
  Planeamiento** deposit. Note the path: **`46250 VALENCIA`** and the deposit id
  **`46250-1001 1991-0010`** — the INE municipality code is in the *filing system itself*, which is
  the strongest municipality guarantee available for a Spanish plan.
  ⚠ **It is an IMAGE-ONLY SCAN** — `pdftotext` yields **0 characters**. It cannot be quoted from
  without OCR, and OCR of a 1991 scan is exactly the `pipeline-extracted` tier Córdoba sits at.

⇒ **Every quote in this file and in the rule pack is taken from the municipal
`(Transcripción)`.** Cross-checking those quotes against the GVA registry scan is a **named
pre-signature task** and is NOT done. Do not assume concordance.

### Municipality VERIFIED — not inferred from a name

The Badalona lesson (*"always verify the MUNICIPALITY, never the numbers"* — it has bitten this
project three times) was discharged three independent ways:

1. **Art. 0.1**, verbatim: *"…la revisión del planeamiento comarcal vigente en el estricto ámbito
   del **término municipal de Valencia**…"*
2. Page furniture on all 157 pp: **AYUNTAMIENTO DE VALENCIA**.
3. The GVA registry deposit path contains **`46250 VALENCIA`**.

### ⚠ `laterModifications` — **`unverified`. NOT `none`.**

`none` is **forbidden here**, and there is positive evidence against it. Bound into the same PDF,
after the 1991 colophon, is:

> *"La modificación del Plan General de Ordenación Urbana de Valencia relativa a la adaptación de
> las normas urbanísticas … fue aprobada definitivamente por resolución del conseller de Obras
> Públicas, Urbanismo y Transportes de **14 de diciembre de 1993, «D.O.G.V.» de 7 de febrero de
> 1994**…"*

That modification **does touch Art. 6.18** — but only as a *parcelación-licence clarification*
(*"Artículos 6.9, 6.18, 6.24, 6.33 y 6.36. Condiciones de la parcela. — Se aclara que…"* about
segregation where a side boundary angle is out of tolerance). **It does not alter the profundidad
edificable or the alignment rule.** Checked, not assumed.

**But that closes only ONE modification, and the plan is 35 years old.** The municipal GIS's own
`origen` field enumerates **494 distinct instruments**, of which **~140 are `MP` (Modificación
Puntual)** (`../findings/VALENCIA-DATA-RECON.md` §3.1). **No modification census was performed.**
⇒ `unverified`.

---

## 2 — Article-by-article verification of the founder's claims

Line references are into `pdftotext -layout -enc UTF-8` output of the municipal `(Transcripción)`.

### ✅ F1 — instrument and date — **VERIFIED**
Colophon *"Valencia, mayo de 1991."* Art. 0.1 states the plan is the *revisión* of the prior
*planeamiento comarcal*; the Disposición Derogatoria repeals the *Plan General de Ordenación Urbana
de Valencia y su Comarca* approved by Decreto of 30 June 1966.

### ❌ F3 / F4 — **the zone-dictionary and routing citations are WRONG**

The founder cited **Art. 4.1.2.a** for the zone codes and **Art. 4.3** for routing. Both are wrong
for this text, and the reason is structural: **article numbers here are Título-scoped** (`0.x` =
Preliminar, `4.x` = Título Cuarto, `6.x` = Título Sexto). **Título Cuarto is *RÉGIMEN DEL SUELO NO
URBANIZABLE***, so:

- **Art. 4.1** = *"Definición"* of **non-developable** land.
- **Art. 4.3** = *"Régimen urbanístico"* of non-developable land, opening
  *"Cualquiera que sea su categoría, el suelo no urbanizable **carece de aprovechamiento
  urbanístico**."* — the opposite subject.

**The zone dictionary is Art. 6.3**, in *TITULO SEXTO: ORDENANZAS PARTICULARES DE LAS ZONAS DE
CALIFICACION URBANISTICA · CAPITULO PRIMERO*, verbatim:

> *"El territorio municipal se divide en Zonas de calificación urbanística cuya delimitación gráfica
> se señala en el **Plano B de Calificación del Suelo**. Las Zonas son las siguientes: **1. En Suelo
> Urbano:** CHP Conjunto Histórico Protegido. **ENS Ensanche. EDA Edificación Abierta. UFA Vivienda
> Unifamiliar.** TER Terciario. IND Industrias y Almacenes."*

**Routing is not an article at all** — it is the chapter structure of Título Sexto (Cap. 2 = CHP,
Cap. 3 = ENS, Cap. 4 = EDA, Cap. 5 = UFA, Cap. 6 = TER, Cap. 7 = IND, Cap. 8 = Urbanizable,
Cap. 9 = No Urbanizable, Cap. 10–12 = Sistemas).

⚠ **Two graphic sheets, and they are not interchangeable:** **Plano B** carries the *zone*
(Art. 6.3); **Plano C** carries the *number of storeys, the depth and the alignments*
(Arts. 6.18.2, 6.19.1). Conflating them would be a category error.

### ✅ F2 / F5 — **VERIFIED verbatim**
`ENS` / `EDA` / `UFA` all present (Art. 6.3.1). *"CAPITULO TERCERO: Zona de Ensanche"*; Art. 6.15
*Ámbito*, Art. 6.16 *Subzonas* (**ENS-1** Ensanche, **ENS-2** Ensanche protegido), Art. 6.17 *Usos*
(*"El uso global o dominante de esta Zona es el Residencial plurifamiliar (Rpf)"*). Arts. 6.18/6.19
sit inside this chapter — confirmed by position, not assumed from the number.

### ✅ F6 / F8 — **Art. 6.19.1 VERIFIED VERBATIM**

> *"1. La altura de cornisa máxima de la edificación se establece en función del **número de plantas
> grafiado en el Plano C**, con arreglo a la siguiente fórmula: **Hc = 4,80 + 2,90 Np.** Siendo Hc la
> altura de cornisa máxima expresada en metros y Np el número de plantas a edificar sobre la baja
> (es decir el señalado en los planos menos uno)."*

### ⚠ F7 — **Np is graphed floors MINUS ONE. This is a material correction.**

The founder's *"Np = number of storeys"* is off by one. The article's own derived table settles it:

| plantas (graphed) | Hc stated | `4,80 + 2,90·(n−1)` | `4,80 + 2,90·n` |
|---:|---:|---:|---:|
| 2 | **7,70** | **7,70** ✅ | 10,60 ❌ |
| 5 | **16,40** | **16,40** ✅ | 19,30 ❌ |
| 9 | **28,00** | **28,00** ✅ | 30,90 ❌ |

⇒ Reading Np as the graphed count **overstates Hc by 2,90 m at every band** — L-616 mechanism-A.
The formula is transcribed into the pack with `npIsGraphedFloorsMinusOne: true` and a test pins all
eight table rows.

⚠ **`maxHeight_m` is NOT an absolute cap even given Np.** Art. 6.19.3 *Enrase de cornisas* can
require a building to align with a neighbour *"aún superando las máximas indicadas"*, within
`E = 1,10 + 0,10·Np`; and Art. 6.19.3.c allows **one extra storey** for ENS-2 infill between two
protected buildings on frontages ≤32 m. Recorded as a finding; never packed.

### ❌ F11 — **THE 20 m DEPTH FALLBACK IS CONDITIONAL. The hypothesised asymmetry does not exist.**

Art. 6.18.2, verbatim and complete:

> *"La ocupación de la parcela edificable se ajustará a las **alineaciones definidas en el Plano C**.
> La edificación **no podrá retranquearse de la alineación exterior** (salvo lo dispuesto para los
> áticos). … **La profundidad edificable será la señalada en el Plano C. Caso de no indicarse ésta,
> no se podrá rebasar los 20 metros.** No obstante, en este último caso, las porciones del hipotético
> patio de manzana resultante en las que las **luces rectas** hubieren de resultar menores de 8 metros
> se considerarán edificables con el número de plantas asignado por el Plan. En el resto del patio de
> manzana se podrá construir en planta baja."*

The founder asked whether the fallback is unconditional. **It is not.** It is gated on
*"Caso de no indicarse ésta"* — *where Plano C does not state one*. Consequences:

1. **PRYZM cannot observe whether Plano C graphs a depth for a given parcel.** Packing 20 m would
   silently assert *"Plano C graphs no depth here"* — a claim about a document PRYZM has not read.
2. **It can err in BOTH directions.** Where Plano C graphs 15 m, publishing 20 m **overstates**
   (mechanism-A). Where it graphs 24 m, 20 m understates.
3. **Even the fallback branch is not a clean 20 m**: the *luces rectas* rider makes parts of the
   resulting patio de manzana buildable *beyond* it, and the rest buildable in planta baja.

⇒ **`depthOrSetback: 'constructed'` (input missing), same as height. ENS REFUSES.**

### ✅ F12 — Art. 5.19 *Superficie ocupable* — **exists, but states no ENS number**
It is a **definition** in *TITULO QUINTO: ORDENANZAS GENERALES DE LA EDIFICACIÓN*:
*"Se entiende por superficie ocupable, la porción de parcela edificable susceptible de ser ocupada
por la edificación sobre rasante."* Useful for the ontology; it is **not** an ENS coverage figure.
The ENS chapter states **no `ocupación` and no `edificabilidad`** — searched, not assumed.

---

## 3 — The rule KIND, established before any number was encoded

**ADR-0270 / C58 §2.2: a wrong KIND is a wrong SHAPE, not a wrong number.**

ENS is **`alignment`**, not setback and not FAR:
- the façade **must** sit on the alineación exterior — *"no podrá retranquearse"* (Art. 6.18.2);
- the envelope is **alineación + profundidad edificable + altura de cornisa**;
- there is **no `edificabilidad` and no `ocupación` in the whole chapter** ⇒ `far` and `coverage` are
  **`not-the-rule-kind`**, i.e. the ordinance working as designed, not a hole in PRYZM.

Same shape as Murcia `MC`/`MG`/`RM1` and Barcelona's Eixample zones.

---

## 4 — Sibling zones — read, and they prove the numbers do NOT transfer

| Zone | Chapter | Height rule | Plano C needed? |
|---|---|---|---|
| **ENS** | Tít. VI Cap. 3, Art. 6.19.1 | `Hc = 4,80 + 2,90·Np` | **YES** |
| **EDA** | Tít. VI Cap. 4, Art. 6.25.1 | `Hc = **5,30** + 2,90·Np` | **YES** |
| **UFA** | Tít. VI Cap. 5, Art. 6.30.1 | closed table: 2→**7 m**, 3→**10 m** | **YES**, with a stated fallback |

⚠ **ENS and EDA differ only in the intercept — 4,80 vs 5,30.** Two formulas that look identical at a
glance and are not. This is precisely the *"Spanish instruments frequently state numerically
identical values for different zones/municipalities"* trap; each was read in its own chapter.

### 🔎 The asymmetry the founder was hunting for EXISTS — but in UFA, and on HEIGHT

Art. 6.30.1, verbatim: **_"Caso de no grafiarse no se podrá edificar más de dos plantas sobre
rasante."_**

That *is* a graphic-independent, stated ceiling — and UFA's table is **closed at 3 plantas / 10 m**,
so **no UFA parcel may exceed 10 m whatever Plano C says**. That is a genuine, quotable upper bound
that survives the absence of Plano C.

⚠ **It still does not let PRYZM publish a per-parcel envelope.** Publishing 10 m on a parcel graphed
at 2 plantas overstates by 3 m (mechanism-A). The bound is recorded as a **finding**
(`VALENCIA_STATED_BOUNDS`) and is the most promising route to a future partial unlock — it is not an
authorisation, and the pack does not use it.

---

## 5 — PARCEL axis: **MEASURED live, and it is essentially free**

⚠ Measured, not assumed — the brief required a live probe.

`Consulta_RCCOOR_Distancia` (national Catastro OVC, **keyless**), at `lon=-0.3670, lat=39.4640`
(Gran Via / Almirante Cadarso, in the Ensanche), 2026-08-01 — **HTTP 200**:

```
<pc1>6618617</pc1><pc2>YJ2761H</pc2>
<loine><cp>46</cp><cm>250</cm></loine>
<ldt>CL ALMIRANTE CADARSO 33 VALENCIA (VALENCIA)</ldt>   <dis>0.02</dis>
```

- **`<cp>46</cp>` + `<cm>250</cm>` composes to `46250`** — exactly the INE code — through the
  **existing, unmodified `composeIneCode()`** already shipping for Murcia. No new code was needed for
  the routing key; a test pins it.
- Nine parcels returned with distances; the referencia catastral is obtained **by identifier**, not
  by a pin guess.
- ⚠ **Almirante Cadarso is named in Art. 6.16.2** as a boundary street of the ENS-2 *"Primer
  Ensanche"* and *"Ensanche de Mora"* — so this fixture sits on the exact zone this pack is about.

⇒ **València resolves through the same national Catastro path as Murcia and Barcelona.** The PARCEL
axis needs **no new provider and no licence**. Independently, the municipal layer 216 publishes
`refcat` directly (`../findings/VALENCIA-DATA-RECON.md` §3.3), so there are **two** routes.

---

## 6 — ⚠ CORRECTION to the existing recon, and the single biggest lead in this city

`../findings/VALENCIA-DATA-RECON.md` §3.2 states the alignment layer *"carries no numeric setback or
depth attribute"*. **That is wrong.** `DescribeLayer` on
`OPENDATA/UrbanismoEInfraestructuras/MapServer/212` (*PGOU - Alineaciones*, **21 975** polygons)
returns a field **`altura`** (`esriFieldTypeString`).

This is *"probe can be wrong three ways"* in the wild: the recon checked layer **names**, and the
field was inside a layer whose name promised only alignments.

**MEASURED across all 21 975 polygons** (2026-08-01, full pagination, `returnDistinctValues` +
per-feature classification — script retained in the turn's scratch, not committed):

| what the value is expressed in | polygons | share |
|---|---:|---:|
| **bare storey count** (`3`, `13`) | **14 384** | **65.5 %** |
| protected / existing-derived (`PROTEGIDO*`, `PTIPOLOGICA`, `BIC_M`, `BRL*`) | ~3 400 | 15.5 % |
| **`<=n` bounded** (`<=5`, `<=6`, `<=3`) | ~500 | 2.3 % |
| delegated (`PPARCIAL`) | 409 | 1.9 % |
| storey count + qualifier (`13(B+1)`, `10(B)`) | 191 | 0.9 % |
| **absolute floorspace** (`10235m2t`) | 107 | 0.5 % |
| **FAR** (`0.8m2t/m2s`) | 15 | 0.07 % |
| **metres** (`13m`, `12m`) | 7 | 0.03 % |
| blank / junk (`+-`, `_`, `*-*`, `0?`) | ~940 | 4.3 % |

**Why this is a LEAD and emphatically NOT an unlock:**

1. ⚠ **It is a FREE-TEXT field carrying at least FOUR different units.** `13` (storeys), `13m`
   (metres), `0.8m2t/m2s` (FAR) and `10235m2t` (absolute m²t) are the *same field*. Reading `13m` as
   13 storeys yields `4,80 + 2,90·12 = 39,6 m` for a **13 m** building — a **3× overstatement**. The
   wrong unit is the wrong KIND.
2. ⚠ **That `altura` == Art. 6.19.1's *"número de plantas grafiado en el Plano C"* is an INFERENCE,
   not a verified fact.** Nothing in the service documents the field. Even granted it, the **−1**
   convention (§2, F7) must be established for the *field*, not just the article.
3. ⚠ **65.5 % is a POLYGON count, not land area.** The layer's own `area` attribute is **null on
   every row** (checked), so an L-656-compliant area denominator is **not available** from
   attributes; it needs geometry download and shoelace. **No area figure is claimed here.**
4. The `PROTEGIDO*` bucket is a real legal **finding** — those are existing-building-derived, the
   same `not-the-rule-kind` shape as Murcia `RB`/`RU`.

⇒ Parsing this field is **ENGINEERING** — a value-vocabulary classifier with a unit discriminator,
exactly the reusable artefact GENOME TEST 01 §B2 asked for — **and it is a separate, signable piece
of work.** It is not transcription and **no signature converts it into one**.

---

## 7 — What this turn establishes, and what it does not

**ESTABLISHED**
- The primary text is **in hand, born-digital, quotable**, and the **municipality is verified** three ways.
- Arts. **6.3.1 · 6.15 · 6.16 · 6.17 · 6.18 · 6.19 · 6.25.1 · 6.30.1 · 5.19** read and quoted verbatim.
- **ENS rule KIND = `alignment`**; `far` and `coverage` are `not-the-rule-kind`.
- **ENS cannot be packed**: height *and* depth both reduce to **Plano C**, which PRYZM does not hold.
- **PARCEL axis is live and keyless** via the national Catastro path — measured.
- A **modification exists** (DOGV 07-02-1994); it does **not** alter the depth or alignment rule.

**NOT ESTABLISHED — do not let a later reader assume otherwise**
- ❌ **What fraction of València's buildable LAND the PGOU orders directly** vs delegates to the
  ~482 non-`PGOU*` instruments in `origen`. Murcia's equivalent split was **67 % delegated**. Until
  the València cross-tab is run (needs geometry + area, per L-656), **any coverage claim is unfounded.**
- ❌ Concordance of the municipal **`(Transcripción)`** with the **GVA registry scan**.
- ❌ A **modification census** since 1994 (~140 `MP` instruments in `origen`).
- ❌ That layer 212 `altura` is Plano C's Np (§6).
- ❌ Anything about **CHP / TER / IND** — chapters not read this turn.
- ❌ Heritage constraints: `Patrimonio_Historico` remains **ArcGIS 499 token-gated** — *unknown, not absent*.

---

## 8 — Fetch requests for a human browser (none are blocking, both are wanted)

Both documents were retrieved **without a 403** — the BCNROC/Murcia pattern did **not** recur here,
and that is worth recording as a positive result. What a human is still wanted for:

| # | Document | Why | Where |
|---|---|---|---|
| R1 | **Plano C** (*Ordenación pormenorizada* sheets) — the graphic carrying `número de plantas`, `profundidad edificable` and alignments, for the ENS extent | **The single blocker.** It is what turns ENS from a refusal into an envelope | `geoportal.valencia.es` viewer / Servicio de Planeamiento. Not found as a REST layer (§6 is a proxy, not the sheet) |
| R2 | OCR or a text-layer copy of the **GVA registry deposit** `46250-1001 1991-0010` | To cross-check the municipal `(Transcripción)` quotes against the registered instrument | URL in §1; 11.8 MB image-only scan |
| R3 | Census of **Modificaciones Puntuales** post-1994 affecting Título VI Cap. 3 | To retire `laterModifications: unverified` | Servicio de Planeamiento / `origen` taxonomy |

*Authority: C58 §1.2/§1.4/§1.7a · C63 · ADR-0270 · L-449 · L-616 · L-656 · L-661 ·
§CONTEXT-DATA-HONESTY. Created 2026-08-01.*