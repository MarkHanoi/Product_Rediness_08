# Clau `16` — Zona de renovació urbana: rehabilitació

> **STATUS: REFUSAL VERIFIED AGAINST THE PRIMARY TEXT — and the refusal is CORRECT.**
> ⚠⚠ **BUT THIS IS THE LOUDEST FINDING OF THE SIX.** The PGM states, for clau 16, **four
> edificabilitat indices, a dwelling density, and four COMPLETE parameter sets** — including one
> that is a textbook `setback` rule (**9,15 m / PB+2 · 250 m² · 40 % · 3 m / 2 m / 2 m**). None of
> it had been transcribed. See §3.
> Family: **zona** · Municipality: Barcelona (`08019`) · Instrument: **PGM-1976**, Normes
> Urbanístiques, Títol IV, Capítol IV, **Secció 10a** (Arts. 359–366). Official designation per
> **Art. 314.10**.
>
> ⚠ Nothing here is self-certified. Founder signature: **NOT GIVEN**.

Primary source: `../../PGM-NNUU-metropolitana.pdf`, **PDF pp. 118–120** (printed 117–119), read
with glyph coordinates.

---

## 1 — THE DELEGATING SENTENCE

> **PGM Art. 360.1** — «Per a l'actuació en aquesta zona **s'elaboraran plans especials** als
> quals **s'elegirà el tipus d'ordenació de l'edificació a aplicar en cadascun dels sectors**,
> adient amb les característiques d'aquests.»

and, for the conditions themselves:

> **PGM Art. 365.1** — «Les condicions generals de l'edificació, i les estètiques, les sanitàries i
> les d'ús **es precisaran, tant com calgui, a les ordenances del Pla Especial**.»
>
> **PGM Art. 365.2** — «Les condicions d'edificació de les diferents zones **seran determinades al
> respectiu Pla Especial** atenent als tipus d'ordenació de l'edificació existent, i **respectaran
> preferentment** les condicions següents: …»

⇒ **The delegation is real, and it is of a specific and important shape: the PLAN CHOOSES THE
ORDERING TYPE.** Art. 360.2 lists four possibilities — *alineacions de vial*, *aïllada*,
*volumetria específica*, plus (360.3) singular *envolupants màximes de volum* for spontaneously
ordered sectors. Art. 365.2 then states a **different, complete parameter set for each**. Holding
all four sets without knowing which one applies is holding **nothing**: it is four different
SHAPES, and picking one would be a wrong KIND, not a wrong number (ADR-0270). The word
*"preferentment"* seals it — even the chosen set binds the plan only preferentially.

**Verdict: `derived-plan` is the CORRECT refusal code.** ✅

---

## 2 — What the code returns (pinned)

`barcelonaZoneRefusal('16')` ⇒ `code: 'derived-plan'`, `legallyGrounded: true`.
Pinned by `packages/site-parcel-data/__tests__/esBarcelonaRefusalClausGrounding.test.ts`.

---

## 3 — ⚠⚠ THE FINDING: this clau states a LOT, and it is all plan-gated

### 3.1 — Art. 362 — *Edificabilitat*. Four stated indices.

> «1. L'índex d'edificabilitat **brut màxim** en aquesta zona serà el de **0,70 m² sostre/m² sòl**.
> 2. L'índex d'edificabilitat **net mitjà** serà el d'**1,37 m² sostre/m² sòl**.
> 3. Els **màxims índexs d'edificabilitat nets** permesos a les àrees de cada tipus d'ordenació
> establerts en aquesta zona, subjectes en els seus valors específics al compliment del valor
> mitjà de la zona, són els següents:
> a. Àrees d'edificació **segons alineacions**: **1,50** m² sostre/m² sòl.
> b. Àrees d'edificació **aïllada**: **1** m² sostre/m² sòl.
> c. Àrees d'edificació **segons volumetria específica**: **2,20** m² sostre/m² sòl.
> d. Àrees d'edificació **segons ordenació lliure**: **1,20** m² sostre/m² sòl.»

| index | value | granularity | outcome |
|---|---|---|---|
| brut màxim | **0,70** | **zone** (a *brut* index is over the whole zone, gross of streets) | STATED |
| net mitjà | **1,37** | **zone average** — ⚠ an AVERAGE, not a cap on any parcel | STATED |
| net max, *alineacions* | **1,50** | area within the zone | STATED, **ordering-type-gated** |
| net max, *aïllada* | **1,00** | area within the zone | STATED, **ordering-type-gated** |
| net max, *volumetria específica* | **2,20** | area within the zone | STATED, **ordering-type-gated** |
| net max, *ordenació lliure* | **1,20** | area within the zone | STATED, **ordering-type-gated** |

⚠ **NONE of these is a parcel FAR.** *Brut* and *net mitjà* are zone-level; the four *net maxima*
are per-**area**, "subject in their specific values to compliance with the zone's average value".
Showing any of them on a parcel card would be the C58 §1.11.2 category error.

### 3.2 — Art. 363 — density

> «…han de fixar la densitat d'habitatges per hectàrees **sense depassar el de 75 habitatges**.»

**75 hab/ha**, STATED, zone granularity, and it binds the *Pla Especial*, not the owner.
⚠ Footnote 59 flags a Barcelona modification at printed p. 187 — the reachable page (PDF p. 188)
belongs to the **20a** subzone conditions of the same 2004 instrument, and **no Barcelona rewrite
of Art. 363 was located**. Recorded as **unverified**, not as "none exists".

### 3.3 — Art. 365.2 — four complete parameter sets, one per ordering type

> **I. Àrees d'edificació segons alineacions.** «Condició 1a. Alçada reguladora màxima segons
> l'amplada del vial i amb límit màxim de plantes, sense admetre àtics. **Regirà el quadre de
> l'article 328.** Condició 2a. Front mínim de parcel·la: **6,50 m**. Condició 3a. L'espai lliure
> interior d'illa **no serà edificable**.»
>
> **II. Àrees d'edificació aïllada.** «Condició 1a. L'alçada reguladora màxima és de **9,15 m**
> corresponent a **planta baixa i dues plantes** com a límit màxim. Condició 2a. La superfície
> mínima de parcel·la és de **250 m²**. Condició 3a. El percentatge màxim d'ocupació de parcel·la
> és del **40 per 100**. … Condició 4a. La separació mínima a les llindes de parcel·la ha de ser
> de **3 m al frontal** i **2 m als laterals i fons**. Condició 5a. S'admeten les edificacions
> auxiliars sense depassar l'ocupació màxima de parcel·la.»
>
> **III. Àrees d'edificació segons volumetria específica.** «Condició 1a. L'alçada màxima admesa és
> de **21,5 m** corresponents a **planta baixa i sis pisos** com a màxim. Condició 2a. La parcel·la
> mínima admesa és la de **800 m²**.»
>
> **IV. Àrees d'edificació segons ordenació lliure.** «S'aplicaran les condicions de les Àrees
> d'edificació aïllada, però respectant les situacions actuals de distàncies menors a límits de
> parcel·la.»

⚠⚠ **SET II IS A COMPLETE `setback` RULE** — front 3 m, side 2 m, rear 2 m, coverage 40 %, height
9,15 m / PB+2, minimum parcel 250 m². That is the exact shape the engine already solves. It is
**gated on the plan having chosen *edificació aïllada* for that area**, which is unobservable, and
on *"respectaran **preferentment**"*. **This is the single largest piece of free coverage the audit
found, and it is still not free.**

⚠ Set I **borrows the Art. 328 table** — the clau **13b** ladder (7,55 / 10,60 / 13,65 / 16,70 on
a 3,05 m module), *"sense admetre àtics"*. That cross-reference is explicit in the article; it is
**not** an inference, and it is the only case in the audit where one clau's height table is
lawfully reused by another.

### 3.4 — Art. 364.2 — reservation modules (per NEW dwelling)

36 m²/dwelling *vials i estacionaments* · 18 m² *espais verds locals* · 12 m² *centres docents
locals* · 9,60 m² other public/social. STATED; a cession duty on the plan, not an envelope figure.

---

## 4 — Amendments

None located for Arts. 359–366 in the committed PDF's Barcelona section, **except** the unverified
footnote-59 pointer for Art. 363 (§3.2). Arts. 362 and 365 carry **no** *"Veure modificació per al
Municipi de Barcelona"* footnote — checked on PDF pp. 119–120.

---

## 5 — Open / unverified

- **Which ordering type applies to a given area** — the gate on everything in §3.3. Set by the
  Pla Especial, published nowhere PRYZM reads.
- **Whether the Pla Especial for the sector exists at all.** Art. 361 requires one; the PGM is
  from 1976.
- **Art. 363's Barcelona modification** — footnote 59 points at printed p. 187; the content found
  there is the 20a subzone table. Unresolved.
- The relationship between the *net mitjà* 1,37 and the four per-area maxima is an allocation
  constraint across the zone, not a per-parcel cap — modelling it would need the zone's full
  area/ordering breakdown.

---
*Verified 2026-07-31 against `../../PGM-NNUU-metropolitana.pdf` pp. 118–120.
Founder signature: **NOT GIVEN**. Authority: C63 · C58 · ADR-0270 · ADR-0271.
Method: `../EXTRACTION-PROTOCOL.md`.*
