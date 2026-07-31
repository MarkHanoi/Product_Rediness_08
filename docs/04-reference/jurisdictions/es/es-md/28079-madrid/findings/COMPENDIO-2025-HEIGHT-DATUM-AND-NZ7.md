# Madrid PGOUM-97 — height datum + sampling rule, and the NZ 7 grado 2º FAR conflict

**Source document:** *Compendio 2025 de las Normas Urbanísticas del Plan General de Ordenación
Urbana de Madrid 1997*, consolidated edition **24-09-2025** (626 pages, born-digital).
**Read date:** 2026-07-31. **Reader:** PyMuPDF text layer, `PYTHONIOENCODING=utf-8`, no OCR.
**Scope:** exactly two questions — the `altura de cornisa` reference plane *and its sampling
rule* (Blocker 1), and whether the NZ 7 grado 2º `0,5` vs `1,0` FAR conflict is real (Blocker 2).
Continues `COMPENDIO-2025-EXTRACTION-01.md` §8.6 and §9.

Page numbers are **PDF page indices as `fitz` counts them (1-based)**. In Título 6 the
**printed page = PDF page − 2**; the same offset holds in Título 8.

---

## BLOCKER 1 — the height datum. **CLOSED, including the sampling rule.**

### Headline

> **`altura de cornisa` in NZ 4 is measured from the `rasante de la acera` — sampled on the
> vertical through the MIDPOINT of the line of façade (`punto medio de la línea de fachada`),
> not the parcel centroid and emphatically not the block centroid.**
> Art. 6.6.8 apartado 6.a) (PDF p205) and Art. 6.3.5.c) (PDF p193).

**The ordinance is NOT silent on sampling.** It states the sampling point expressly, twice, in
two independent articles, and it further states what to do when the façade is long, when the
street slopes, on corner parcels, on opposite-street parcels, and when there is no pavement at
all. This is a directly encodable rule, not a gap.

This is the exact defect recorded as **L-584** in this repo (terrain present, but sampled at one
point on the block centroid). Madrid's rule is *per-façade, at the façade midpoint*, with
mandatory stepping above 20 m of façade length. An implementation that samples the block
centroid will be wrong on every sloping street in the casco.

---

### Q1 — What is the reference plane? Verbatim.

Two articles say the same thing from two directions.

**(a) The general altimetric definition — Art. 6.3.5 apartado c), PDF p193 (printed 191):**

> *"**Cota de origen y referencia:** La que se define en el planeamiento como origen para la
> medición de la altura del edificio, considerándose en **edificación aislada** la **cota de
> nivelación de planta baja**, que se tomará como cota cero (0) y en **edificación en manzana
> cerrada** la **rasante de la acera en el punto medio de la línea de fachada**.*
>
> *No obstante, las normas zonales, las ordenanzas particulares de las áreas del planeamiento
> correspondiente del Plan General, pueden determinar la situación o elemento que se instituye
> como cota de origen o referencia.*
>
> ***En ningún caso la cota de origen y referencia podrá situarse por encima de la cota de
> nivelación de la planta baja.**"*

*(Article modified by MPG 00/343, aprobación definitiva 08.11.2023, BOCM 27.11.2023.)*

**(b) The measurement rule for street-width-derived heights — Art. 6.6.8 apartado 6, PDF p205
(printed 203):**

> *"**Salvo que las normas zonales establezcan criterios específicos** o las ordenanzas de los
> planeamientos de desarrollo los instituyan justificadamente, la medición de la altura se hará
> con arreglo a los siguientes criterios:*
>
> *a) **La altura de cornisa se medirá en la vertical correspondiente al punto medio de la línea
> de fachada, tomando como cota de origen y referencia la rasante de la acera en dicho punto.**"*

*(Article modified by MPG 00/343, aprobación definitiva 08.11.2023, BOCM 27.11.2023.)*

**The chain that binds this to `altura de cornisa`** — Art. 6.6.6 (PDF p203, printed 201):

> *"**Artículo 6.6.6 Altura en unidades métricas (N-2).** Es la altura del edificio medida en
> unidades métricas **desde la cota de origen y referencia** hasta cualquiera de las demás
> referencias altimétricas o elementos del edificio y en función de ellos será altura de cornisa,
> altura de coronación y altura total."*

and Art. 6.6.5 (PDF p203), which anchors the *upper* end of the measurement and is the article
that keeps cornisa / coronación / total distinct:

> *"**Artículo 6.6.5 Referencias altimétricas de los edificios (N-2).** Son las que sirven para
> determinar las distintas alturas en un edificio, tomadas en relación con la cota de origen y
> referencia, **determinada de acuerdo con el art. 6.3.5. apartado c)** y se distinguen las
> siguientes:*
>
> *1. **Nivel de cornisa:** El de la intersección de la cara inferior del forjado que forma el
> techo de la última planta con la fachada del edificio.*
>
> *2. **Nivel de coronación:** El del plano superior de los petos de protección de cubierta si
> existieren, o en su defecto el de la cara superior del remate del forjado de la última planta.*
>
> *En función de estas referencias resultarán la altura de cornisa y la altura de coronación,
> siendo **la altura total la que se mide hasta el elemento más alto del edificio**."*

**Does this apply to NZ 4?** Yes, on both routes:

- Art. 6.3.5.c names the *edificación en manzana cerrada* branch, and Chapter 8.4 is literally
  `CAPÍTULO 8.4. CONDICIONES PARTICULARES DE LA ZONA 4: EDIFICACIÓN EN MANZANA CERRADA`.
- Art. 6.6.8's *"salvo que las normas zonales establezcan criterios específicos"* escape hatch is
  **not taken by Chapter 8.4**. I grepped PDF pages 410–418 (the whole of Chapter 8.4) for
  `cota de origen`, `cota de nivelación`, `rasante de la acera`, `6.6.8`, `6.3.5`, `se medirá`.
  Chapter 8.4 contains **no article establishing altura-measurement criteria** — there is no
  equivalent of NZ 9's Art. 8.9.11 or NZ 5's Art. 8.5.10. Art. 8.4.10 gives the table and nothing
  else. The general rule therefore applies unmodified.

Art. 8.4.10, for the record (PDF p414–415, printed 412–413):

> *"**Artículo 8.4.10 Altura de la edificación (N-2).** La altura de la edificación en plantas y
> en metros a la cornisa se fija en función del ancho de calle, con arreglo al siguiente cuadro
> de relación:"*
>
> | Ancho de calle (metros) | Nº de plantas | Altura de cornisa (metros) |
> |---|---|---|
> | Menos de 12 | 3 | 11,50 |
> | De 12 a menos de 18 | 4 | 15,00 |
> | De 18 a menos de 24 | 5 | 18,50 |
> | De 24 en adelante | 6 | 21,50 |

---

### Q2 — Where along the plane is it sampled? **This is the load-bearing answer.**

**At the midpoint of the line of façade, on the vertical through that point, taking the pavement
rasante at that same point.** Art. 6.6.8.6.a, quoted verbatim above. Not the centroid of the
parcel; not the centroid of the block; not an average of the street; not the lowest or highest
point of the frontage.

The article then gives **six** disambiguating sub-rules, all at PDF p205–206 (printed 203–204),
verbatim:

| Case | Rule (Art. 6.6.8.6) |
|---|---|
| **Normal** | *(a)* *"La altura de cornisa se medirá en la vertical correspondiente al punto medio de la línea de fachada, tomando como cota de origen y referencia la rasante de la acera en dicho punto."* |
| **No pavement exists** | *(b)* *"Cuando no exista acera, la medición se hará del mismo modo, tomando como cota de origen y referencia el punto de la vertical situado a la cota de rasante de la calle, **incrementada con la altura correspondiente al declive transversal de la acera, calculado con pendiente del dos con cinco por ciento (2,5%)**."* |
| **Corner parcel** | *(c)* *"En parcelas de esquina, la altura se tomará para cada una de las fachadas del modo antes descrito."* — i.e. **one datum per façade**, not one per parcel. |
| **Sloping street / long façade** | *(d)* *"En calles en pendiente, la altura se medirá en el punto medio de la fachada. **Si la longitud de la fachada es superior a veinte (20) metros, se descompondrá la línea de fachada en fracciones de longitud igual o inferior a veinte (20) metros.** El número de escalonamientos será el menor posible, salvo que justificadamente por adaptación al entorno circundante sea conveniente incrementar el número de ellos. **Ni la altura en metros, ni la expresada en plantas, podrá rebasarse en ninguno de los escalonamientos.**"* |
| **Opposite street frontages** | *(e)* *"En parcelas con frentes a calles opuestas, entendiéndose por tales aquellas cuyos ejes forman entre sí un ángulo inferior a noventa (90) grados sexagesimales, la altura se medirá para el ancho de cada calle, manteniéndose esta altura **hasta una profundidad determinada por la bisectriz del ángulo formado por la prolongación de las alineaciones oficiales**."* |
| **Street + plaza together** | *(f)* *"En parcelas con alineaciones oficiales a calles y plazas conjuntamente, se considerará la altura correspondiente a cada uno de dichos espacios públicos, tratándose, en función de la posición de la parcela respecto de ellas, como parcelas en esquina o parcelas con frentes a calles opuestas."* |
| **Mixed** | *(7)* *"En situaciones mixtas, el modo de fijar la altura se establecerá combinando las reglas anteriores."* |

**Implementation consequence, stated plainly.** The rule is *per-façade-segment*, with a hard
20 m segmentation ceiling on sloping streets. A single terrain sample per parcel is only correct
for a straight, level frontage ≤ 20 m long. For anything longer or sloping, the envelope is a
**stepped** solid: N segments of ≤ 20 m, each with its own datum taken at that segment's
midpoint, each independently capped at the same metre *and* storey figure. `escalonamiento`
does not buy extra height — 6.6.8.6.d says so expressly.

**Two further sampling rules that do not live in 6.6.8** and matter for the *aislada* zones:

- **Art. 6.3.5.c, closing paragraph (PDF p193):** *"Cuando se instituya como cota de origen y
  referencia la de nivelación de planta baja y por las necesidades de la edificación o por las
  características del terreno en que se asiente, **deba escalonarse la misma, la medición de las
  alturas se realizará de forma independiente en cada una de las plataformas que la componga**,
  sin que dicho escalonamiento de planta baja pueda traducirse en exceso de altura."*
  — the *aislada* analogue of the 20 m stepping rule: per-platform, independent, no height bonus.
- **Art. 6.6.15.1.b (PDF p208–209, printed 206–207)** constrains where the *cota de nivelación de
  planta baja* may itself sit, and it does so with the same midpoint logic:
  *"i) Entre más/menos ciento cincuenta (150) centímetros respecto a la **rasante de la acera en
  el punto medio del lindero frontal**"*; *"ii) En parcelas con linderos frontales a calles
  opuestas … respecto al **punto medio del segmento que une los puntos medios de dichos linderos
  frontales**"*; *"iii) En parcelas de esquina … del **punto medio de la rasante en la acera del
  lindero frontal de mayor longitud**"*; plus cases iv–ix for three-frontage, triangular and
  polygonal full-block parcels, a ±1,50 m cap on raising the parcel rasante above neighbours
  (viii), and an Estudio de Detalle escape (ix).

**So even the "free" datum is not free.** In an *aislada* zone the cota de nivelación de planta
baja is a *project* datum chosen by the designer — but it is boxed in by (i) Art. 6.3.5.c's
absolute cap *"en ningún caso … por encima de la cota de nivelación de la planta baja"*, (ii)
Art. 6.6.15.1.b's ±150 cm window around a **pavement rasante sampled at a named midpoint**, and
(iii) the per-platform stepping rule. It is therefore *derived from* terrain at a specific
sampled point, not independent of it.

---

### Q3 — Does the datum differ by zone, by street width, or by parcel slope?

- **By street width: NO.** Street width selects the *value* (plantas / metres, Art. 8.4.10) but
  never the *datum*. Art. 6.6.8 apartados 1–5 are about deriving the value from the width;
  apartado 6 is about measuring, and is width-independent.

- **By parcel slope: it changes the SAMPLING, not the datum.** The plane is still the rasante de
  la acera; slope triggers Art. 6.6.8.6.d's ≤20 m segmentation and per-segment sampling.

- **By zone: YES — but the real discriminator is TYPOLOGY, and zones then override.**
  Art. 6.3.5.c splits on typology first (*aislada* → cota de nivelación de planta baja;
  *manzana cerrada* → rasante de la acera at the façade midpoint), then lets norma zonal override.
  Measured against the Compendio, per extracted zone:

| Zone | Typology (article) | Datum | Where the zone says so |
|---|---|---|---|
| **NZ 1** | *"edificación entre medianerías formando manzana cerrada"* (Art. 8.1.2.2, p367) | rasante de la acera at midpoint of línea de fachada | **Chapter 8.1 states no criteria** — grepped p367–386 for `cota de origen`/`cota de nivelación`/`rasante de la acera`/`6.6.8`: **zero hits**. General rule applies. |
| **NZ 4** | *manzana cerrada* (chapter heading) | rasante de la acera at midpoint of línea de fachada | **Chapter 8.4 states no criteria** — grepped p410–418: no datum article. General rule applies. |
| **NZ 5** | bloques abiertos (*aislada*) | cota de nivelación de la planta baja | **Express.** Art. 8.5.10 (p421): *"La cota de origen y referencia coincide con la de nivelación de la planta baja y se situará de acuerdo con las determinaciones del art. 6.6.15."* Art. 8.5.9.1 restates it for the height maxima; Art. 8.5.6.2 for the H used in setbacks. |
| **NZ 7 grado 1º** | *aislada* (Art. 8.7.1.2) | **rasante de la acera at midpoint of línea de fachada — zone override** | **Express and it OVERRIDES the aislada default.** Art. 8.7.11.1 (p435): *"…ni una altura de cornisa superior a mil cuatrocientos cincuenta (1.450) centímetros, **medida desde la rasante de la acera en el punto medio de la línea de fachada**."* |
| **NZ 7 grados 2º/3º** | *aislada* | cota de nivelación de planta baja | **Express.** Art. 8.7.11.2 (p435): *"…ni una altura de cornisa de mil cincuenta (1.050) centímetros, **midiendo ambos valores desde la cota de nivelación de planta baja**."* |
| **NZ 8** | aislada / pareada / hilera (Art. 8.8.1.2) | ground contact at midpoint of the access façade, **plus a second, higher 12,00 m limit at every other façade midpoint** | Express in Chapter 8.8 (already recorded in `nz8.json` from pass 01). |
| **NZ 9 grados 1º/2º** | (Art. 8.9.1) | **rasante de la acera at midpoint of línea de fachada** — resolved via the redirect | Art. 8.9.11.a (p455): *"En los grados 1º y 2º, la medición de la altura se hará **conforme a lo dispuesto en el artículo 6.6.8**."* → lands on 6.6.8.6.a. **This closes the `nz9.json` "datum sits in Título 6, outside scope" note.** |
| **NZ 9 grados 3º/4º/5º** | (Art. 8.9.1) | cota de nivelación de la planta baja | Art. 8.9.11.b (p455): *"En los grados 3º, 4º y 5º, la medición de la altura se realizará respecto a la **cota de nivelación de la planta baja**, situada según lo dispuesto en el artículo 6.6.15."* |

**NZ 7 grado 1º is the one that would trip an implementation.** It is an *aislada* typology
(Art. 8.7.1.2) — so the Art. 6.3.5.c default is *cota de nivelación de planta baja* — yet
Art. 8.7.11.1 expressly overrides it to *rasante de la acera at the façade midpoint*. Deriving
the datum from typology alone gets NZ 7 grado 1º wrong. **Read the norma zonal first, fall back
to 6.3.5.c second.**

---

### Q4 — Is there a separate definition for *altura total* / *altura de coronación*?

**Yes. Three distinct levels, one shared origin.** Art. 6.6.5 (verbatim in Q1 above):

| Term | Upper reference | Article |
|---|---|---|
| **altura de cornisa** | *"la intersección de la cara inferior del forjado que forma el techo de la última planta con la fachada del edificio"* | 6.6.5.1 |
| **altura de coronación** | *"el plano superior de los petos de protección de cubierta si existieren, o en su defecto … la cara superior del remate del forjado de la última planta"* | 6.6.5.2 |
| **altura total** | *"la que se mide hasta el elemento más alto del edificio"* | 6.6.5, closing sentence |

All three share the **same origin** — the cota de origen y referencia (Art. 6.6.6). They differ
only in where the measurement stops. **They are not interchangeable**, and the Compendio uses
different ones in different zones: NZ 4 / NZ 7 / NZ 8 / NZ 9 regulate **cornisa**; NZ 5
regulates **coronación** (Art. 8.5.9.1); NZ 7's ático allowance is a **coronación** figure
(Art. 8.7.11.2, 1.250 cm) sitting above a **cornisa** figure (1.050 cm) in the same paragraph.

**The gap between cornisa and the real top is quantified** by Art. 6.6.11 (PDF p206–208, printed
204–206) and it is large — an envelope generator that stops at cornisa understates the
silhouette:

- *"a) Las vertientes de la cubierta que no podrán sobresalir respecto a **un plano de una
  inclinación máxima de cuarenta y cinco grados (45º)** trazado por la línea que forman el borde
  superior del forjado de la última planta con los planos de fachada…"*
- *"b) Los remates de las cajas de escaleras, casetas de ascensores, depósitos y otras
  instalaciones, que no podrán sobrepasar una **altura total de cuatrocientos (400) centímetros
  sobre la altura de cornisa**."*
- apartado 2: *"antepechos, barandillas y remates ornamentales, que **no podrán rebasar en
  doscientos (200) centímetros la altura de cornisa**"*; open-air sports construction confined to
  *"la superficie piramidal formada por planos trazados a cuarenta y cinco grados (45º) desde los
  bordes del último forjado y un plano horizontal situado a **trescientos setenta y cinco (375)
  centímetros** de altura, medidos desde el nivel de cornisa."*
- apartado 3: **áticos and torreones** above the last storey, permitted only where the norma
  zonal allows them (NZ 4 does — Art. 8.4.10.2.b) or via Estudio de Detalle.
- apartado 4: above *altura máxima total*, only flues/antennae, solar panels, crowning signage,
  and ornamental elements on dotacional buildings.

And Art. 6.6.9.2 (PDF p206) makes both expressions binding simultaneously:

> *"Cuando se establezca la altura por número de plantas y unidades métricas, **ambas habrán de
> respetarse como máximos admisibles**."*

— so NZ 4's `3 plantas / 11,50 m` is a conjunction, not a choice. Whichever binds first, binds.

**Also worth encoding — Art. 6.6.8.2, an independent 2:1 cap (PDF p204):**

> *"Las nuevas construcciones, cuando sitúen su línea de edificación sobre la alineación oficial,
> no podrán guardar una relación entre la altura de cornisa en metros y ancho de calle superior a
> la proporción **2:1**, salvo para aquellas zonas en que fuera preciso superarla por la
> aplicación de reglas de colindancia o condiciones estéticas."*

Sanity check against NZ 4's table: the binding row is `< 12 m → 11,50 m`. At a 6 m street,
11,50 / 6 = 1,92 ≤ 2 — passes. At a 5 m street, 11,50 / 5 = 2,30 > 2 — **the 2:1 cap bites and
reduces the height below the table figure.** So on very narrow casco streets the NZ 4 table is
*not* the operative constraint. This is a live interaction, not a theoretical one, and it is not
currently modelled in `nz4.json` (recorded as an open item in §"Still undetermined" below).

**And the street-width measurement rule** the whole table depends on — Art. 6.6.8.3 (PDF p204):

> *"Para la fijación de la altura, la medición del ancho de la calle se realizará entre las
> alineaciones definidas en el Plano de Ordenación … **siempre en la perpendicular a la
> alineación en el punto medio del lindero frontal de la parcela**."*
> — with *(a)* non-parallel alignments → same perpendicular-at-midpoint rule; *(b)* parcels
> fronting a **plaza** → *"se tomará el ancho correspondiente a la más ancha de las calles que
> confluyen en ella"*; *(c)* street mouths/intersections → measure to the prolongation line of
> the official alignments, falling back to the plaza rule where that is impossible; *(d)* streets
> resolved in planeamiento remitido → the ficha fixes the width.

Note the symmetry: **width is sampled at the midpoint of the lindero frontal; height datum is
sampled at the midpoint of the línea de fachada.** These are *different points* whenever the
building is set back from the alignment or the façade is shorter than the frontage. On a
retranqueada building they will not coincide.

Finally, Art. 6.6.7 (PDF p204) ties the *storey count* to the same origin:

> *"**Artículo 6.6.7 Altura en número de plantas (N-2).** Corresponde al número de plantas por
> encima de la **cota de origen y referencia** incluida la planta baja."*

— which is why the `maxFloors` records also carry a datum in the updated JSON. Storeys are
counted **above the cota de origen y referencia, planta baja included**. On a stepped façade
that count is per-segment too (6.6.8.6.d: *"Ni la altura en metros, ni la expresada en plantas,
podrá rebasarse en ninguno de los escalonamientos"*).

---

## BLOCKER 2 — NZ 7 grado 2º FAR: `0,5` vs `1,0`. **APPARENT, NOT REAL. RESOLVED.**

### Verdict

> **Both values are correct and they govern disjoint sets of parcels.**
> `0,5 m²/m²` is the **grado 2º** figure (residential uso cualificado).
> `1,0 m²/m²` is the **grado 2º nivel "e" especial** figure (terciario uso cualificado, residential
> expressly prohibited). Nivel "e" is a proper subset of grado 2º, so the general grado figure is
> displaced within it.
> **The conflict cannot arise on any real parcel**, for the reason in step 4 below.

### The two texts, verbatim

**Art. 8.7.9 Coeficiente de edificabilidad (N-1), apartado 1 — PDF p434 (printed 432):**

> *"1. El **coeficiente de edificabilidad neta sobre parcela edificable** se establece **para cada
> grado** en:*
> *a) Grado 1º: Ocho (8) metros cuadrados por cada diez (10) metros cuadrados.*
> ***b) Grado 2º: Cinco (5) metros cuadrados por cada diez (10) metros cuadrados.***
> *c) Grado 3º: Siete (7) metros cuadrados por cada diez (10) metros cuadrados."*

*(Footnote 530: article modified by MPG 00/343, aprobación definitiva 08.11.2023, BOCM 27.11.2023.)*

**Art. 8.7.20 Condiciones particulares del grado 2º Nivel "e" especial (N-1) — PDF p438
(printed 436), the article in full:**

> *"En el **grado 2º nivel "e" especial**, el uso cualificado es, el terciario en sus clases de
> oficinas y hospedaje. **La edificabilidad máxima es de un (1) metro cuadrado por metro cuadrado
> de parcela edificable**, pudiendo implantarse en planta baja el resto de usos terciarios,
> excepto el mediano comercio y grandes superficies comerciales. **Queda prohibido expresamente el
> uso residencial**."*

*(No footnote — original PGOUM-97 text, never amended.)*

### The reasoning, step by step

**1. They are not measuring different things — the denominators are identical.**
8.7.9.1 says *"neta sobre parcela edificable"*. 8.7.20 says *"por metro cuadrado de parcela
edificable"*. Same denominator (`parcela edificable`), same character (neta). This is **not** a
neta-vs-bruta artefact. Ruled out.

**2. Neither is a cross-reference to the other.** 8.7.20 states an independent number and cites
no article; 8.7.9 does not mention niveles at all. Ruled out.

**3. Their scopes are different, and one is a strict subset of the other.**
- Art. 8.7.9.1 fixes the coefficient *"para cada **grado**"* and enumerates exactly three:
  grados 1º, 2º, 3º. **It legislates at grado level.**
- Art. 8.7.20 is titled, in the document's own words, *"**Condiciones particulares** del grado 2º
  **Nivel "e" especial**"*. **It legislates at nivel level**, for a named sub-division.
- Art. 8.7.17 (PDF p436, printed 434) establishes that sub-division:
  > *"A los efectos de aplicación de las condiciones referentes a los usos compatibles y
  > autorizables, se distinguen en función de los grados diferenciados en el art. 8.7.3, los
  > siguientes niveles: a) En el grado 1º, niveles a y b. **b) En el grado 2º, un nivel "e"
  > especial.** c) En el grado 3º, no se establecen niveles."*

  Nivel "e" ⊂ grado 2º. A provision expressly labelled *particular conditions of the subset*,
  stating a numeric maximum for that subset, governs that subset. The general grado figure
  continues to govern the remainder of grado 2º.

**4. The decisive point — within nivel "e" the 0,5 figure can never be operative anyway.**
Art. 8.7.20 provides *"Queda prohibido expresamente el uso residencial."* The 0,5 of Art. 8.7.9.1.b
is the coefficient for the grado's *uso cualificado*, which Art. 8.7.1.3 (PDF p432, printed 430)
declares to be residential **and carves nivel "e" out of, at the very top of the chapter**:

> *"3. Su uso cualificado es el residencial. **Excepto en el grado 2º nivel "e", en el que el uso
> cualificado es el Terciario en sus clases de Oficina y Hospedaje**."*

So a nivel-"e" parcel cannot be developed under the residential regime at all. The only
development permitted there is the terciario one, and Art. 8.7.20 fixes its edificabilidad at
1,0. **There is no parcel to which both numbers could apply.** That is what makes this apparent
rather than real: the drafter carved nivel "e" out of the chapter's use regime in Art. 8.7.1.3
*and* gave it its own conditions article in 8.7.20 — two independent, deliberate acts.

**5. The alternative reading is self-defeating.** If 8.7.20's 1,0 were merely an *additional*
cap sitting on top of the 0,5, then 0,5 (being lower) would always bind and Art. 8.7.20's
edificabilidad sentence would be inoperative in every case. A reading that renders an express
provision a dead letter is not available. 8.7.20 **replaces**, it does not stack.

**6. Structural precedent inside the same chapter.** Art. 8.7.18.2.b.i (PDF p437, printed 435)
attaches a nivel-specific FAR to grado 1º **nivel b** for an alternative use, in exactly the same
shape:

> *"i) Terciario Oficinas, Hospedaje, Recreativo, Otros Servicios Terciarios y Comercial en las
> categorías de pequeño y mediano comercio, en edificio exclusivo, **con una edificabilidad máxima
> de doce (12) metros cuadrados por cada diez (10) metros cuadrados de parcela edificable**."*

1,2 m²/m² for grado 1º nivel b's alternative use, versus 0,8 m²/m² for grado 1º generally
(Art. 8.7.9.1.a). **The Compendio demonstrably does attach FARs to niveles when a non-residential
regime is taken up.** The 8.7.9 / 8.7.20 pair is the same construction, one grado over. This was
already carried in `nz7.json` from pass 01 without being flagged as a conflict — consistency
demands the same treatment for nivel "e".

### The counter-argument, and why it does not survive

Art. 8.7.17's opening words limit niveles to use matters: *"**A los efectos de aplicación de las
condiciones referentes a los usos compatibles y autorizables**, se distinguen … los siguientes
niveles"*. On a strict reading, a nivel could not carry a building parameter at all, and 8.7.20's
1,0 would be a drafting error.

It does not survive, for three textual reasons:

1. Art. 8.7.1.3 already assigns nivel "e" a different **uso cualificado** — which is neither a
   *uso compatible* nor a *uso autorizable*. 8.7.17's declared scope is therefore already
   narrower than what the chapter actually does with nivel "e". 8.7.17 describes the *ordinary*
   function of niveles; it is not an exhaustive limit on them.
2. Art. 8.7.20 is an **express special provision of equal normative rank** — both articles are
   marked **(N-1)**, so there is no rank tiebreak in 8.7.9's favour. A specific express provision
   of equal rank prevails over a general one within its scope.
3. Art. 8.7.20 sits in *Sección Cuarta. Otras condiciones de uso*, and 8.7.9 in *Sección Segunda.
   Condiciones de la nueva edificación*. That placement is the strongest point *for* the
   counter-argument — but the same objection would invalidate Art. 8.7.18.2.b.i's 1,2 m²/m², which
   also sits in a use section (*Sección Tercera*) and which nobody disputes. Section placement is
   not doing normative work here.

**Recorded honestly:** the Compendio contains **no express derogation clause** linking 8.7.20 to
8.7.9. The resolution above is a scope reading, not a stated hierarchy. It rests on Art. 8.7.20's
own title, Art. 8.7.17's subset relation, and — decisively — Art. 8.7.1.3's carve-out plus
8.7.20's express residential prohibition, which together make the two figures mutually
unreachable. The record is emitted `confidence: "resolved-by-scope"` with both citations retained,
so a reviewer can see and overturn the reasoning without re-reading the PDF.

### What is NOT displaced in nivel "e"

Art. 8.7.20 speaks only to **uso cualificado**, **edificabilidad** and the planta-baja use list.
It is silent on everything else, so grado 2º's ordinary figures continue to apply to nivel "e"
parcels:

| Parameter | Value for grado 2º incl. nivel "e" | Article |
|---|---|---|
| Parcela mínima | 2.500 m² | 8.7.4.1.b |
| Lindero frontal mínimo | 10 m; inscribable circle ⌀30 m | 8.7.5.1.b, 8.7.5.2 |
| Retranqueo | > 10 m | 8.7.7.1 |
| Separación a linderos | ≥ 7 m | 8.7.7.2 |
| Ocupación (sobre + bajo rasante combined) | ≤ 30 % | 8.7.8.2 |
| Altura | 3 plantas / 10,50 m cornisa, from cota de nivelación de planta baja | 8.7.11.2 |
| Nº máximo de viviendas | *moot* — residential prohibited in nivel "e" (8.7.20) | 8.7.10.b |

A 1,0 FAR against a 30 % combined footprint cap implies a minimum of ~3,3 effective storeys of
coverage against a 3-storey limit — i.e. **in nivel "e" the FAR and the ocupación cap are close
to simultaneously binding**, and the 1,0 is only achievable at near-maximum footprint and full
height. Under the 0,5 reading it would be trivially achievable. That the 1,0 produces a taut,
non-trivial envelope is a weak corroboration that 1,0 is the intended nivel-"e" figure, not a
stray digit. Flagged as corroboration only; the resolution does not rest on it.

---

## Records updated

All under `docs/04-reference/jurisdictions/es/es-md/28079-madrid/extracted/`.

Every height record now carries three fields:

- `referencePlane` — the datum, verbatim in Spanish.
- `samplingRule` — a new object: `{ point, cases[], articulo, apartado, pdfPage, verbatim }`.
  Where the ordinance names the sampling point, `point` states it. Where it does not, `point` is
  `null` with a reason — **never guessed**.
- `datumSource` — which article supplies the datum, so a reviewer can see whether it came from
  the norma zonal or from the Título 6 default.

| File | Records touched | Change |
|---|---|---|
| `nz4.json` | 8 (4 × `maxFloors`, 4 × `maxHeight_m`) | `referencePlane` null → `"rasante de la acera en el punto medio de la línea de fachada"`; `samplingRule` added (façade midpoint + the 6 sub-cases); `referencePlaneNote` replaced with the resolved citation. **Blocker 1 closed for NZ 4.** |
| `nz9.json` | 12 (`maxFloors` + `maxHeight_m`, grados 1º–5º) | grados 1º/2º: the "datum sits in Título 6, outside scope" placeholder replaced with the resolved 6.6.8.6.a datum via the Art. 8.9.11.a redirect. grados 3º/4º/5º: cota de nivelación de planta baja, sampling per 6.3.5.c + 6.6.15. |
| `nz7.json` | 6 (`maxFloors` + `maxHeight_m`, 7.1.a / 7.1.b / 7.2.e) | `maxFloors` given the datum its sibling `maxHeight_m` already carried; `samplingRule` added to all six. Grado 1º's zone override (8.7.11.1) explicitly marked. |
| `nz7.json` | 1 (`farRatio`, zone `7.2.e`) | `confidence: "ambiguous"` → `"resolved-by-scope"`; `value` `null` → `1.0`; both citations retained plus the reasoning chain. **Blocker 2 closed.** |
| `nz5.json` | 3 (`maxFloors`, 5.1/5.2/5.3) | datum + sampling from Art. 8.5.10 / 8.5.9.1; measurement kept as **coronación**, not cornisa. |
| `nz8.json` | 10 (`maxFloors`, all grados) | datum copied from the sibling `maxHeight_m` record; `samplingRule` records the per-façade midpoint rule and the second 12,00 m limit at other façades. |
| `nz1.json` | 12 (`maxHeight_m` + `maxFloors`, grados 1º–6º) | datum resolved to the general manzana-cerrada rule (Art. 8.1.2.2 typology → 6.3.5.c; Chapter 8.1 states no criteria). **Values remain `null` for grados 1º–5º** — Art. 8.1.15.1 leaves them to the CPPHAN, and a datum is not a value. |

`referencePlane` is now non-null on **every** height record in the extracted set.

---

## Still undetermined — stated explicitly

1. **The 2:1 cornisa/street-width cap (Art. 6.6.8.2) is not modelled.** It is an independent
   constraint that can *reduce* NZ 4's table height on streets narrower than 5,75 m, and its own
   escape hatch (*"salvo para aquellas zonas en que fuera preciso superarla por la aplicación de
   reglas de colindancia o condiciones estéticas"*) is discretionary and unquantified. Encoding
   the cap is straightforward; encoding the escape is not. **Not added to the records** — it is a
   cross-parameter rule, not a per-zone value, and inventing a record shape for it was out of
   scope for this pass.

2. **`altura total` has no per-zone maximum in the extracted zones.** Art. 6.6.9.1 contemplates
   the planeamiento fixing a limit *"en el que puede situarse el nivel de cornisa o de coronación
   o la altura total"*, and Art. 6.6.11.4 forbids construction above *"la altura máxima total que
   se determine"* — but NZ 4 fixes only cornisa. The only `altura total` figure found anywhere in
   Chapter 8.4 is the 8 m cap on the special one-storey over-depth body (PDF p418). So for NZ 4
   the true silhouette ceiling is `cornisa + 400 cm` (stair/lift housings, 6.6.11.1.b) or the 45°
   roof plane, whichever governs — **derived, not stated**. Recorded here, not in the JSON.

3. **`ancho de calle` still has no source.** Art. 6.6.8.3 tells you *how* to measure it
   (perpendicular at the midpoint of the lindero frontal, between the alignments on the Plano de
   Ordenación) but the alignment geometry is a **GIS acquisition**, not a PDF value. This is the
   same class of blocker as NZ 1's `Z` coefficient. Unchanged by this pass.

4. **The plaza rule needs a gazetteer.** Art. 6.6.8.6/3.b defines *plaza* by reference to the
   **callejero oficial municipal** (*"el espacio público con esa denominación u otra análoga, como
   glorieta o plazoleta, en el callejero oficial municipal"*). Deciding whether a frontage is a
   plaza — and then finding *"la más ancha de las calles que confluyen en ella"* — requires the
   official street register. Not in this document.

5. **NZ 7 nivel "e" is not delimited in this document.** The resolution above tells you *what*
   applies in nivel "e"; it does not tell you *which parcels are in it*. Art. 8.7.17.b establishes
   the nivel but no article maps it to ground; that lives on the Plano de Ordenación. Until the
   GIS layer distinguishes `7.2` from `7.2.e`, the 1,0 cannot be applied to a specific parcel.
   **This is now the binding blocker on NZ 7 grado 2º, and it is a data problem, not a legal one.**

6. **Art. 6.6.8.6's "salvo que las normas zonales establezcan criterios específicos" was verified
   only for the extracted zones.** Chapters 8.2 (NZ 2), 8.6 (NZ 6), 8.10 and 8.11 were not read in
   this pass or the last. If any of them institutes its own datum, that is unrecorded. Their zones
   are not in the extracted set, so nothing currently emitted is affected.

7. **`effectiveDate` remains `null` throughout.** Unchanged from pass 01: the footnotes give
   approval and BOCM publication dates, not entry-into-force dates, and one is not inferred from
   the other.

---

## Method

Read with PyMuPDF (`fitz`) against
`compendio.pdf` (25.7 MB, 626 pages, born-digital, no OCR), `PYTHONIOENCODING=utf-8`.
Pages read in full: **192–194** (Art. 6.3.5–6.3.9), **203–209** (Chapter 6.6 through Art. 6.6.15),
**413–416** (NZ 4 Arts. 8.4.9–8.4.14), **432–439** (the whole of Chapter 8.7), **455** (Art. 8.9.11),
**367 / 375** (NZ 1 Arts. 8.1.2, 8.1.15), **419–421** (NZ 5 Arts. 8.5.6, 8.5.9, 8.5.10).
Negative checks run as keyword sweeps over whole chapters (`cota de origen`, `cota de nivelación`,
`rasante de la acera`, `6.6.8`, `6.3.5`, `se medirá`, `medición de la altura`) — a **zero-hit sweep
over Chapters 8.1 and 8.4 is itself the evidence** that those chapters take no `criterios
específicos` escape from Art. 6.6.8.6, and is reported as such rather than as an absence of
finding.

No value in this document was inferred, interpolated or estimated. Every figure carries
`articulo` + `apartado` + `pdfPage` + `verbatim`.
