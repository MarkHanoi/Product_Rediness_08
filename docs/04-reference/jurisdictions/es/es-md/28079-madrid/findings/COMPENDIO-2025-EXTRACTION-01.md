# Madrid PGOUM-97 — Compendio 2025 extraction, pass 01

**Source document:** *Compendio 2025 de las Normas Urbanísticas del Plan General de Ordenación
Urbana de Madrid 1997*, consolidated edition **24-09-2025** (626 pages, born-digital).
**Read date:** 2026-07-31. **Extraction scope:** Título 8 (Condiciones particulares del suelo
urbano), Normas Zonales 1, 3, 4, 5, 7, 8, 9 — plus Capítulo 3.2 and Artículo 8.0.6 for the
override-precedence question.

All page numbers below are **PDF page indices as `fitz` counts them (1-based)**. Throughout
Título 8 the **printed page = PDF page − 2**; every emitted record carries both.

---

## 1. Method

Three small rerunnable scripts in `tools/madrid-extract/`:

| Script | Purpose |
|---|---|
| `index_pdf.py` | Structure discovery + page dump + regex grep + PyMuPDF table detection |
| `build_records.py` | Emits `nz1/nz5/nz7/nz8/nz9.json` from transcribed values |
| `validate.py` | Parses every emitted file; fails if any non-null value lacks `articulo` + `apartado`; prints the table/prose ratio |

No OCR. The text layer was read directly with PyMuPDF. Console output required
`PYTHONIOENCODING=utf-8` on Windows — without it the accented characters mojibake, and an early
read of NZ 4 came back corrupted. Every `verbatim` string in the JSON was re-read under UTF-8.

`validate.py` currently exits 0: **282 records, 0 uncited non-null values.**

---

## 2. How the document is actually structured

### 2.1 The "TÍTULO VIII" mystery is solved — the Compendio uses ARABIC numerals

The prior probe found no `TÍTULO VIII` and concluded structure had to be inferred from article
numbers. The real reason is simpler and worth recording: **this document never uses Roman
numerals for títulos.** The heading at PDF p365 reads:

> `TÍTULO 8. CONDICIONES PARTICULARES DEL SUELO URBANO`

Searching `^TÍTULO [0-9]` finds all eight títulos immediately. The two `TÍTULO` hits at p96/p97
that the earlier probe saw were indeed cross-references — but the heading text was always there,
just spelled `8`, not `VIII`. Structure did **not** have to be inferred.

### 2.2 Two blocks: TOC then body

- **PDF p7–p25** — table of contents. This is the source of every misleading early hit
  (`norma zonal` first at p9, `8.4.x` first at p23, `actividades econ` first at p9). **No page in
  this range was cited as a source.**
- **PDF p29–p626** — body.

### 2.3 Título → first body page

| Título | PDF page |
|---|---|
| 1 Disposiciones generales | 29 |
| 2 Intervención municipal | 51 |
| 3 Régimen urbanístico del suelo | 61 |
| 4 Protección del patrimonio | 103 |
| 5 Sostenibilidad ambiental | 174 |
| 6 Parámetros y condiciones generales de la edificación | 188 |
| 7 Régimen de los usos | 249 |
| **8 Condiciones particulares del suelo urbano** | **365** |

### 2.4 Título 8 chapter → page map (the deliverable map)

| Cap. | Norma Zonal | PDF pages | Printed pages | Status |
|---|---|---|---|---|
| 8.0 | Preliminar (definitions, área classes, catalogue precedence) | 365–366 | 363–364 | read |
| 8.1 | **NZ 1** Protección del Patrimonio Histórico | 367–386 | 365–384 | extracted |
| 8.2 | NZ 2 Protección de las Colonias Históricas | 387–396 | 385–394 | out of scope |
| 8.3 | **NZ 3** Volumetría específica | 397–409 | 395–407 | refusal documented |
| 8.4 | **NZ 4** Edificación en manzana cerrada | 410–418 | 408–416 | extracted |
| 8.5 | **NZ 5** Edificación en bloques abiertos | 419–423 | 417–421 | extracted |
| 8.6 | NZ 6 Edificación en cascos anexionados | 424–431 | 422–429 | out of scope |
| 8.7 | **NZ 7** Edificación en baja densidad | 432–438 | 430–436 | extracted |
| 8.8 | **NZ 8** Edificación en vivienda unifamiliar | 439–450 | 437–448 | extracted |
| 8.9 | **NZ 9** Actividades económicas | 451–459 | 449–457 | extracted |
| 8.10 | Ejes terciarios | 460–461 | 458–459 | out of scope |
| 8.11 | Remodelación | 462–463 | 460–461 | out of scope |

**NZ 9's chapter number is 8.9 — confirmed, not inferred.** The heading at PDF p451 reads
verbatim: `CAPÍTULO 8.9. CONDICIONES PARTICULARES DE LA ZONA 9: ACTIVIDADES ECONÓMICAS`. The
zone roster in Art. 8.0.5 (p365–366) independently lists all eleven zones and confirms
`Zona 9 — Actividades económicas`.

### 2.5 The grado/nivel distinction — the single most load-bearing structural finding

The 34 live `AMB_TX_ETIQ` codes mix two different things, and they do **not** mean the same
thing in every zone:

- **NZ 8** — Art. 8.8.3 defines six **grados**; Art. 8.8.16 confines **niveles a/b/c** to the
  *régimen de usos* only: *"A los efectos de la aplicación de las condiciones referentes a los
  usos compatibles y autorizables se distinguen, en función de los grados diferenciados en el
  art. 8.8.3 los siguientes niveles a, b y c."* Every building parameter — parcela, linderos,
  retranqueos, ocupación, edificabilidad, altura — is stated **per grado only**. So `8.3.a` and
  `8.3.c` share an identical envelope; only their permitted uses differ. Two nivel-specific
  exceptions exist and are recorded: grado 1º nivel c (Art. 8.8.17.2.b — alternative-use FAR
  1 m²/m², coverage 40%/70%) and grado 2º nivel a (Art. 8.8.4.2.c — registered parcels take
  grado 3º position conditions).
- **NZ 9** — the opposite. Art. 8.9.3: *"estableciéndose los niveles a y b en el grado 4º, **a
  efectos de posición de la edificación**."* Here the nivel **is** geometric: `9.4.a` and `9.4.b`
  differ on separación a linderos (3 m vs 6 m), retranqueo (free vs 8 m) and altura (5 plantas /
  20 m vs 7 plantas / 28 m), while sharing the same 2,4 m²/m² FAR.
- **NZ 7** — Art. 8.7.17 gives grado 1º niveles a/b, grado 2º a special nivel "e", grado 3º none.
  Nivel is use-facing, but Art. 8.7.20 also fixes a nivel-"e"-specific FAR.
- **NZ 4** — **no grados at all.** Chapter 8.4 has no "Clasificación en grados" article; Art.
  8.4.1 defines one undivided ámbito. `zoneCode` is `"4"` for all 19 records.

Treating a nivel suffix as always-geometric (or always-cosmetic) would be wrong in half the zones.

---

## 3. Q1 — `COEF_Z`: what it legally means and its denominator

**Answer: `COEF_Z` is the *Coeficiente ponderado de edificabilidad* (Z) of Art. 8.1.10.
Its denominator is the PARCELA — specifically a grado-defined `superficie computable (S)` — never
the manzana and never the ámbito.**

Art. 8.1.10 (PDF p371, printed 369) opens:

> *"La edificabilidad máxima de una parcela (E) se determina en función de la siguiente fórmula:
> **E = S x Z x C**. Siendo: S: Superficie computable de parcela a efectos de edificación;
> Z: Coeficiente ponderado de edificabilidad; C: Coeficiente corrector del índice de densidad"*

And Z itself:

> *"Coeficiente ponderado de edificabilidad (Z): Es un factor que interviene en la determinación
> de la edificabilidad en función de las características urbanísticas y constructivas del
> entorno. Este coeficiente no determina la altura admisible en número de plantas, ya que este
> parámetro se fija, excepto en el grado 6º, en función de las alturas de cornisa de los edificios
> colindantes y debe ser aprobada por la CPPHAN."*

### The denominator, spelled out

Z multiplies **S**, and S is defined per grado (Art. 8.1.10.3):

| Grado | `superficie computable S` | C |
|---|---|---|
| 1º | *"la superficie de parcela comprendida entre la alineación oficial fijada en el Plano de Ordenación y el fondo máximo definido en el Plano de Condiciones de la Edificación"* | **0,875** |
| 2º | *"la superficie de la parcela edificable definida en el artículo 6.2.9"* | **0,66** |
| 3º | same as grado 1º (alineación → fondo máximo band) | **0,90** |
| 4º | *"la superficie de parcela edificable definida en el artículo 6.2.9"* | **0,75** |
| 5º | no formula — buildability = the existing building | — |
| 6º | *"la superficie de la parcela edificable definida en el artículo 6.2.9"* | **0,66** |

Art. 8.1.10.1: *"Superficie computable (S): Es aquella parte de la parcela que interviene en el
cómputo de la edificabilidad."* — **"aquella parte de la parcela"**. Unambiguous.

### The trap, named

The manzana hypothesis is a reasonable read of the GIS schema and it is **wrong**. Z is
*published* per-manzana on the *Plano de Condiciones de la Edificación* — which is exactly why
the GIS layer keys it on `CODMANZANA` — but it is *applied* to a parcel-scale S. Multiplying Z by
the block area would overstate buildable floor area by the block-to-parcel ratio, which in the
Madrid casco is commonly 10–40×. **The key field and the denominator are different things.**

The `"0 / 5"` values are consistent with a manzana carrying two Z zones (e.g. an interior band
with Z = 0, i.e. non-buildable, and a perimeter band with Z = 5). Chapter 8.1 does not describe
the encoding of that string — that is a GIS-layer question, not a legislative one, and I did not
invent an answer.

### Three further cautions

1. **Z is not a storey count** — except in grado 6º, where Art. 8.1.15.1 makes them coincide.
2. **Z's value is not in this document.** For grados 1–4 it is *"El fijado en el Plano de
   Condiciones de la Edificación"*. Only grado 6º has an in-document table (Art. 8.1.10.3.f.ii,
   PDF p372): street width `<7 m → Z=3`, `7–<12 → 4`, `12–<18 → 5`, `18–<24 → 6`, `≥24 → 7`.
   Street width is measured *"con los mismos criterios que … están previstos en el Capítulo 8.4"*.
3. **A documented fallback exists** for parcels fronting streets of differing width (Art. 8.1.10,
   closing paragraph of 3.f, PDF p373): the formula is abandoned and Art. 8.4.9.2–3 is used
   instead, *"sin considerar el fondo máximo de doce (12) metros"*.

---

## 4. Q2 — NZ 5's rule KIND

**Answer: BOTH kinds are present, and they are three separate rules, not one. The parcel-boundary
rule is `separación a linderos` and reuses shipped code. But the front rule is neither — it is
measured to the STREET CENTRELINE, and that is a rule type you probably do not have.**

All three live in Art. 8.5.6 (PDF p419–420, printed 417–418).

**(a) To parcel boundaries — `separación a linderos`, Art. 8.5.6.4.a:**

> *"La edificación se dispondrá de modo que sus fachadas guarden una separación igual o superior
> a H/2 de su altura de coronación, respecto del lindero correspondiente, con mínimo de cinco (5)
> metros."*

`max(5, H/2)` to *el lindero correspondiente* — no lateral/testero distinction anywhere in
Chapter 8.5. This is the ordinary boundary-setback geometry.

**(b) Between buildings on the same parcel — `separación entre edificios`, Art. 8.5.6.5.a:**

> *"Cuando en una parcela se proyecten varios edificios que no guarden continuidad física,
> deberán respetar una separación entre sus fachadas igual o superior a la mayor de sus alturas
> de coronación, con mínimo de seis (6) metros."*

`max(6, H)` between façades, with four documented reductions (blank walls / non-habitable
openings / no overlap → H/3 min 4 m; overlap < 8 m → 3H/4 min 4 m; and a solar-access escape
requiring >2 h of sun on 22 December). This only bites for multi-building parcels.

**(c) The front rule — and this is the one that will break an implementation. Art. 8.5.6.3:**

> *"La edificación guardará una separación igual a H/2 de su altura de coronación **respecto al
> eje de la calle** o del espacio libre público al que hace frente la parcela. En el caso de la
> existencia de una zona verde de acompañamiento de viario interpuesta entre la parcela
> edificable y la correspondiente vía, la separación se medirá al eje del conjunto de ambas."*

NZ 5 imposes **no retranqueo from the alineación oficial at all**. The front constraint is
distance to the **eje de la calle** — the street centreline. The equivalent distance from the
parcel frontage is `H/2 − (street width / 2)`, which goes to zero or negative on wide streets,
i.e. non-binding. Encoding this as a front setback would be an invention, so `setbackFront_m` is
emitted as `null` with the mechanism recorded. Note also the second sentence: where a
*zona verde de acompañamiento de viario* is interposed, the centreline is that of **road plus
green strip combined** — so the geometry needs the green-strip polygon, not just the carriageway.

**Practical read:** (a) reuses shipped code. (c) is a genuinely new rule type — measure-to-axis,
with a composite axis case. (b) is new but only matters for multi-building parcels.

Also note the datum: NZ 5's H is **altura de coronación measured from the cota de nivelación de
la planta baja** (Art. 8.5.6.2 and 8.5.10), *not* cornisa. Its maxima — 51 m / 30 m / 15 m — are
**coronación** figures and must not be compared with the cornisa numbers of NZ 4, 7, 8 or 9.

---

## 5. Q3 — override precedence, per parameter

**Answer: there is no single global precedence clause. The Compendio resolves this by
*área class* rather than by rule stack, and each override has its own scope. Ordering below is
what the document actually supports.**

### 5.1 The catalogue beats the Norma Zonal — but only for *obras*

Art. 8.0.6 (PDF p366, printed 364) is the only clean, express precedence rule in Título 8:

> *"Cuando un edificio, su parcela, espacio libre adyacente o cualquiera de los elementos que lo
> formen, se encuentren incluidos en alguno de los Catálogos de Protección, **el régimen de obras
> previsto en el Título 4 de estas Normas tendrá preferencia sobre las que autorice la norma
> zonal** por la que se regule. Igualmente las condiciones especiales del uso de hospedaje
> regulado en el artículo 4.3.8, apartado 7, tendrán preferencia respecto a las condiciones de
> usos regulados en la norma zonal correspondiente."*

Scope is precise and narrow: **régimen de obras** (what works are permissible) and the
**hospedaje use conditions**. It does *not* say the catalogue overrides FAR, height or coverage.
A catalogued building in NZ 4 still takes its 12 m fondo and its street-width height table; what
changes is which *works* may be carried out on it.

### 5.2 API / APE / APR are not overrides — they are a different regime entirely

Art. 8.0.4 (PDF p365) partitions urban land into four **classes of área**, which are mutually
exclusive:

> *"a) **Área de ordenación directa:** Regulada por las condiciones particulares establecidas en
> el presente Título, Capítulos 8.1 al 8.11 […] b) **Áreas de Planeamiento Incorporado (API):**
> Reguladas por el régimen urbanístico que se define en el Capítulo 3.2, Sección Segunda.
> c) **Áreas de Planeamiento Específico (APE):** […] Sección Tercera. d) **Áreas de Planeamiento
> Remitido (APR):** […] Sección Cuarta."*

So the Normas Zonales govern *ordenación directa* land. Where an API/APE/APR applies, that
área's regime is the primary source — the Norma Zonal does not sit "underneath" it as a default.

**API (Art. 3.2.7, PDF p69):**

> *"1. Las condiciones particulares por las que se rigen las API, son las correspondientes al
> **planeamiento inmediatamente antecedente que se asume**, detalladas en los documentos de
> planeamiento originales, cuyas referencias se relacionan en la Ficha de Planeamiento
> Incorporado, y con las modificaciones o adaptaciones que **exclusivamente**, en su caso, se
> especifican en la casilla de Observaciones y Determinaciones Complementarias."*
>
> *"3. Cuando la casilla de Observaciones y Determinaciones Complementarias esté en blanco, se
> sobreentiende que el planeamiento inmediatamente antecedente se asume íntegramente."*
>
> *"4. En caso de discrepancia entre el planeamiento antecedente y el Plano de Ordenación (O), se
> consideran predominantes las determinaciones específicas de los expedientes de origen, en todo
> lo que no figure expresamente indicado en la casilla de Determinaciones Complementarias."*

This is a **complete substitution with an explicit residual**: antecedent plan governs; the
Observaciones box is the *only* channel by which the Plan General edits it; the antecedent plan
beats even the Plano de Ordenación on conflict. Títulos 6 and 7 (general conditions) still apply
(Art. 3.2.7.5). And critically, Art. 3.2.7.11: where an API's incorporated planning *refers to*
NZ 4, current NZ 4 applies plus whatever the ficha adds — so an API can *invoke* a Norma Zonal.

**APE (Art. 3.2.10, PDF p74):** partial, and the ficha decides which mode. Three cases:

- ficha silent on aprovechamiento → *"siendo éste el que resulte de aplicar **las condiciones
  específicas de la norma zonal** correspondiente a la superficie del ámbito"* — **the Norma
  Zonal governs**, and the ficha's edificabilidad figures are *"meras referencias, que pueden
  variarse en función de la aplicación de la norma zonal"*;
- ficha states an Aprovechamiento Tipo → *"éste tendrá carácter vinculante"* and the ficha's
  edificabilidad figures become mere references;
- ficha states a maximum m² → *"ésta tendrá carácter vinculante"*.

Plus two sub-rules worth encoding: **graphic beats numeric** for dotacional areas —
*"predomina siempre la definición gráfica (Plano de Ordenación y Ficha de Ordenación Propuesta)
sobre las indicaciones numéricas de la Ficha de Condiciones Particulares salvo indicación expresa
en contra"* (3.2.10.4) — and **a referenced carpeta beats everything** —
*"las determinaciones de la documentación contenida en dicha carpeta prevalecen sobre las del
Plano de Ordenación y las fichas"* (3.2.10.5).

**APR (Art. 3.2.13, PDF p76):** ficha-borne, with vinculante/indicativa split declared in ficha
(e); like API, an APR referring to NZ 4 takes current NZ 4 plus the ficha.

### 5.3 The resulting per-parameter ordering

For a parcel carrying Norma Zonal + APR/APE/API + catálogo + ficha:

| Parameter | Governing source, strongest first |
|---|---|
| **Which works are permitted** | Título 4 catalogue regime (Art. 8.0.6) → then the área regime → then the Norma Zonal |
| **Hospedaje use conditions** | Art. 4.3.8.7 (Art. 8.0.6) → then área regime → Norma Zonal |
| **Edificabilidad, in an API** | Antecedent plan, as edited *only* by the Observaciones box (3.2.7.1/3/4). Norma Zonal applies only if the antecedent plan invokes it (3.2.7.11) |
| **Edificabilidad, in an APE** | Referenced carpeta (3.2.10.5) → ficha Aprovechamiento Tipo or m² if stated (3.2.10.3.b/c) → **else the Norma Zonal** (3.2.10.3.a) |
| **Edificabilidad, in an APR** | Ficha vinculante determinations → Norma Zonal where the ficha invokes it (3.2.13) |
| **Dotacional surface areas, in an APE** | Graphic definition beats the ficha's numbers (3.2.10.4) |
| **Height, coverage, setbacks** | No express catalogue override. Área regime if any; otherwise the Norma Zonal. In NZ 1 grados 1–5, height is CPPHAN-discretionary regardless (Art. 8.1.15.1) |
| **General building conditions (patios, cómputo, etc.)** | Títulos 6 and 7 apply to API (3.2.7.5) and APE (3.2.10.6) alike, subject to ficha-borne general determinations |

**Honest limit:** the Compendio contains **no article stating a global precedence order** across
Norma Zonal / área de planeamiento / catálogo. The table above is assembled from four
independently-scoped clauses (8.0.6, 8.0.4, 3.2.7, 3.2.10, 3.2.13). Where a real parcel carries
both a catalogue listing and an APE ficha that are silent on each other, this document does not
resolve it — the ficha must be read. I did not read any APR/APE-specific ficha (out of scope).

---

## 6. Q4 — NZ 4 `fondo edificable`

**Answer: 12 metres, Art. 8.4.7 apartado 1, PDF p412 (printed 410). Measured from the
ALINEACIÓN OFICIAL — the street line — not from the parcel boundary.**

The value:

> **Artículo 8.4.7 Fondo edificable (N-2)**
> *"1. Se establece un fondo máximo edificable de doce (12) metros."*

*(Article amended by MPG 00/343, aprobación definitiva 08.11.2023, BOCM 27.11.2023.)*

Art. 8.4.7 itself does not state the datum. **Art. 8.4.9.1 does, unambiguously** (PDF p414,
printed 412) — it constructs the buildable polygon and names its three edges:

> *"La superficie edificable de la parcela viene definida por el resultado de multiplicar la
> altura en número de plantas que le corresponda en función del ancho de calle, según el art.
> 8.4.10., por la superficie de parcela edificable comprendida dentro del polígono definido por
> **la alineación oficial**, los linderos laterales y **una línea paralela a dicha alineación
> trazada a doce (12) metros de distancia, medidos perpendicularmente en todos sus puntos**."*

So: from the **alineación oficial**, perpendicular, at every point. Art. 8.4.9.3 repeats the
construction for corner parcels (*"las paralelas a las mismas trazadas a doce (12) metros"*).

**One documented exception moves the datum.** Art. 8.4.6.1.b)ii (PDF p412) — where a whole
manzana-front is set back ≥3 m:

> *"En este caso el fondo máximo edificable se tomará desde la fachada retranqueada"*

i.e. from the set-back façade, not the alineación oficial. This only applies to *actuaciones
sobre frente de manzana completo*, not to individual parcels.

**Five carve-ups that let the 12 m be exceeded** (Art. 8.4.7.2, PDF p412–413) — all preserve the
testero separation: salientes per Art. 6.6.19.1; terraces ≤1 m and miradores per the street-width
table in 8.4.13; interior projecting bodies ≤10 m wide with their own separation rules; and — the
big one — a **ground-floor** industrial/dotacional body reaching **18 m** depth, whose area beyond
12 m *"no computará a efectos de edificabilidad"*. Art. 8.4.7.3 then confines any such
over-depth building to the wedge between the lateral-boundary bisector and the 12 m line.

**Implementation warning:** the 12 m is not a simple offset of the parcel. It clips against
`linderos laterales`, and Art. 8.4.9 makes it the *area* input to buildability — so a parcel
shallower than 12 m gets its true depth, and a parcel with two opposing street frontages gets two
polygons that must be **unioned, not summed** (*"Cuando por las condiciones de forma de la parcela
se superpongan ambas poligonales, se computará una única vez el espacio común"*).

---

## 7. Table-vs-prose ratio

| File | Records | `table` | `prose` | `null` |
|---|---|---|---|---|
| `nz1.json` | 51 | 5 | 46 | 27 |
| `nz3-refusal.json` | 0 | 0 | 0 | 0 |
| `nz4.json` | 19 | 8 | 11 | 2 |
| `nz5.json` | 27 | 0 | 27 | 6 |
| `nz7.json` | 31 | 0 | 31 | 3 |
| `nz8.json` | 92 | 0 | 92 | 10 |
| `nz9.json` | 62 | 12 | 50 | 14 |
| **TOTAL** | **282** | **25** | **257** | **62** |

**Ratio: 25 : 257 — 8.9 % table, 91.1 % prose.**

### Recommendation: do NOT build a table extractor

Three independent reasons:

1. **The volume isn't there.** Under 9 % of values come from tables, and they come from exactly
   **three** tables in the whole of the extracted scope: NZ 4's street-width height table (Art.
   8.4.10, p415), NZ 9's street-width height table (Art. 8.9.10, p454), and NZ 1 grado 6º's Z
   table (Art. 8.1.10.3.f.ii, p372). Three tables is a transcription job, not a tooling job.
2. **PyMuPDF's `find_tables()` does not work on them anyway.** Run against p415 it returns one
   table whose extracted content is only the two header rows — the numeric body rows are not
   ruled and are not captured:
   ```
   --- page 415: 1 table(s)
     table 0 bbox=(149.5, 93.5, 460.0, 130.5)
      |  | Ancho de calle |  | Nº de plantas |  | Altura de cornisa |
      |  | (metros) |  |  |  | (metros) |
   ```
   The data rows arrive correctly in the plain text layer in reading order. **The text layer is
   the better extractor here**, and a table extractor would be strictly worse.
3. **The hard values aren't tabulated at all.** Every FAR (8.1.10, 8.5.8, 8.7.9, 8.8.9, 8.9.9),
   every coverage figure, every setback and the entire NZ 8 grado ladder is prose, laid out as
   lettered lists (`a) Grado 1º: …`). The genuine parsing problem in this document is
   **per-grado lettered list prose**, not tables.

If tooling is wanted, build a *grado-list* parser, not a table extractor.

---

## 8. Everything left `null`, and why

62 null values. None is a scraping failure — each is a documented absence. Grouped by cause:

### 8.1 The rule is a formula, not a constant (5)

| Zone | Parameter | Why |
|---|---|---|
| `4` | `farRatio` | Art. 8.4.9: `plantas × area(polygon)`. Needs street width *and* parcel geometry. No constant exists. |
| `1.1 1.2 1.3 1.4 1.6` | `farRatio` | Art. 8.1.10: `E = S × Z × C`. Only C is in the document. |

### 8.2 The value lives on a map, not in the Compendio (3)

| Zone | Parameter | Why |
|---|---|---|
| `1.1 1.3` | `buildableDepth_m` | Art. 8.1.14.1: *"el fondo máximo queda establecido en el Plano de Condiciones de la Edificación."* Binding, but map-borne. |
| `1.5` | `buildableDepth_m` | Art. 8.1.14.3: map, or failing that an Estudio de Detalle. |

Z for NZ 1 grados 1–4 is the same category — *"El fijado en el Plano de Condiciones de la
Edificación"*. **This is the single biggest blocker to automating NZ 1** and it is a GIS-layer
acquisition problem, not a legislative one.

### 8.3 The determination is discretionary — a human body decides (11)

| Zone | Parameter | Why |
|---|---|---|
| `1.1 1.2 1.3 1.4 1.5` | `maxHeight_m`, `maxFloors` | Art. 8.1.15.1: *"la altura de cornisa en metros y número de plantas se establecerá individualmente para cada caso por la CPPHAN, previa presentación de las diferentes soluciones o propuestas que armonicen con los edificios colindantes."* No rule exists to encode. An envelope generator must **refuse** for NZ 1 grados 1–5. |
| `1.6` | `maxHeight_m` | Grado 6º gets a storey count (= Z) but **no cornisa height in metres**. Art. 8.1.16 gives minimum storey heights (360 cm ground / 300 cm upper) — minimums cannot yield a maximum, and deriving metres from storeys is out of bounds. |
| `1.5` | `farRatio`, `maxCoverage`, `setbackFront_m` | Defined by the existing building; on substitution, by Estudio de Detalle. |

### 8.4 The chapter expressly establishes no such rule (25)

| Zone | Parameter | Why |
|---|---|---|
| `4` | `maxCoverage` (above grade) | Art. 8.4.8.1: *"la ocupación es la resultante de aplicar las condiciones fijadas en los artículos 8.4.5, 8.4.6. y 8.4.7."* A residual, not a percentage. |
| `5.1 5.2 5.3`, `7.1.a 7.1.b 7.2.e`, all 10 NZ 8 codes, all 6 NZ 9 codes | `buildableDepth_m` | These are aislada / bloques-abiertos / unifamiliar / industrial typologies. No `fondo edificable` article exists in Chapters 8.5, 8.7, 8.8, 8.9. Nothing to cite. |
| `1.2 1.4` | `buildableDepth_m` | Art. 8.1.14.2: *"En los grados 2º y 4º **no se establece fondo máximo**"* — an affirmative absence. |
| all 6 NZ 9 codes | `maxCoverage` | **Chapter 8.9 has no ocupación article at all** — no equivalent of 8.4.8 / 8.5.7 / 8.7.8 / 8.8.8 anywhere in Arts. 8.9.1–8.9.16. Footprint is a residual of the separación, alineación and FAR rules. `null` here means "no coverage rule exists", emphatically not 0. |

### 8.5 The rule exists but is not expressible as the requested parameter (4)

| Zone | Parameter | Why |
|---|---|---|
| `5.1 5.2 5.3` | `setbackFront_m` | Measured to the **street centreline**, not the alignment. See §4. |
| `9.3 9.4.a` | `setbackFront_m` | Art. 8.9.7.2: *"La nueva edificación podrá separarse de la alineación oficial en función de sus necesidades."* Unconstrained — which is **not** the same as 0 m (0 would mean a mandatory build-to line, as in grados 1º/2º). |
| `1.3 1.4 1.6` | `setbackFront_m` | Art. 8.1.11.2: setback optional and unquantified, **but** the alineación must still be materialised at ground floor by built fabric, arcades or an architectural enclosure. Neither 0 nor free. |
| `1.5` | `setbackFront_m` | Position = that of the existing building. |

### 8.6 Recorded as a datum gap rather than an assumption

Not nulls, but flagged in-record. **NZ 4's height table gives `altura de cornisa` with no stated
datum** — Art. 8.4.10 says only *"en metros a la cornisa"*. The reference plane lives in Título 6
(general altura rules), which was outside this pass's scope. `referencePlane` is `null` with a
note rather than an assumed *"rasante oficial"*. Same for NZ 9 grados 1º/2º, where Art. 8.9.11.a
redirects to Art. 6.6.8. **Reading Título 6 Cap. 6.6 (PDF ~200–225) is the obvious next pass.**

---

## 9. Conflicts reported, not resolved

One, per the rules:

**NZ 7 grado 2º nivel "e" — FAR.** Art. 8.7.9.1.b (PDF p434) sets grado 2º at *"Cinco (5) metros
cuadrados por cada diez (10) metros cuadrados"* = 0,5 m²/m². Art. 8.7.20 (PDF p438) sets grado 2º
nivel "e" at *"un (1) metro cuadrado por metro cuadrado de parcela edificable"* = 1,0 m²/m².
Both are emitted with `confidence: "ambiguous"` and cross-references. Art. 8.7.20 is the more
specific provision and sits in *Sección Cuarta. Otras condiciones de uso*, which argues for it —
but the Compendio contains no express derogation clause, so the choice is not mine to make.

---

## 10. Other findings worth carrying forward

1. **Height datums are genuinely heterogeneous across zones and are preserved distinct in every
   record.** NZ 4 / NZ 7 / NZ 8 / NZ 9 regulate **cornisa**; NZ 5 regulates **coronación**. The
   *reference planes* differ too: NZ 7 grado 1º measures from *rasante de la acera at the façade
   midpoint*; NZ 8 grados 1–4/6 from *ground contact at the midpoint of the access façade* (with
   a **second, higher 12,00 m limit on all other façades** measured from ground at each façade
   midpoint); NZ 5 and NZ 7 grados 2/3 from *cota de nivelación de planta baja*. Collapsing these
   to one "height" field will produce wrong envelopes on sloping ground.
2. **NZ 4 and NZ 9 street-width tables are different and must not be shared.** NZ 4 has four rows
   topping out at 6 plantas / 21,50 m; NZ 9 has three rows topping out at 5 plantas / 18,50 m
   (*"A partir de 18"*).
3. **NZ 8's ocupación is a single combined above-plus-below-grade budget** — *"La ocupación del
   conjunto formado por las edificaciones situadas sobre y bajo rasante"* (Art. 8.8.8.1). NZ 4,
   NZ 5 and NZ 7 grado 1º give separate above/below figures. NZ 7 grados 2/3 are combined like
   NZ 8. Getting this wrong doubles or halves the basement.
4. **NZ 8 grado 6º FAR is tiered**, not scalar: 0,7 on the first 500 m², 0,5 on the excess
   (Art. 8.8.9.1.f). A single coefficient is only correct for parcels ≤500 m².
5. **NZ 7 grado 1º below-grade coverage is tiered too** (Art. 8.7.8.1): 60 % generally, but for
   *plantas enteramente subterráneas* 100 % up to 1.600 m² and 100 %/60 % split above.
6. **NZ 9 grados 1º/2º's "12 m" is not a fondo edificable.** Art. 8.9.6.1 uses 12 m as a
   *party-wall-regime threshold* — build between medianeras for the first 12 m, then separate 3 m.
   Building beyond it is expressly contemplated; Art. 8.9.14.1 even contemplates a *fondo máximo*
   exceeding 80 m. Do not import NZ 4's 12 m fondo here.
7. **Amendment provenance is captured per record** where the footnotes carry it. Most of Título 8
   was amended by **MPG 00/343** (aprobación definitiva 08.11.2023, BOCM 27.11.2023), and the uses
   articles 8.4.15 and 8.5.15 by **MPG 00/346** (aprobación definitiva 27.08.2025, BOCM
   22.09.2025) — the latter is why the 24-09-2025 edition supersedes the 07-07-2025 one.
   `effectiveDate` is left `null` throughout: the footnotes give approval and publication dates,
   not entry-into-force dates, and I did not infer one from the other.

---

## 11. Out of scope / not attempted

- **Chapters 8.2 (NZ 2), 8.6 (NZ 6), 8.10 (Ejes terciarios), 8.11 (Remodelación)** — not requested.
  NZ 6 (Cascos anexionados, p424–431) and NZ 2 (Colonias históricas, p387–396) are real zones with
  real grados and will be needed for full coverage.
- **Título 6** (general building parameters) — needed to close the height-datum gap in §8.6, and
  for Arts. 6.2.9 (*parcela edificable*), 6.3.13 (*adosamiento*), 6.6.8 / 6.6.15 (*altura
  measurement, cota de nivelación*), 6.7.14 / 6.7.15 (*patios*) — all of which the Normas Zonales
  cite constantly.
- **Título 7** (usos) — the compatible/authorisable use tables are cited per record but not
  transcribed exhaustively.
- **The `Plano de Condiciones de la Edificación`** — carries Z and the NZ 1 grados 1º/3º fondo
  máximo. Not a PDF; a GIS acquisition task.
- **Any APR/APE/API ficha** — explicitly excluded.
- **`minParcel`, `minFrontage`, `maxDwellings`** — not in the requested parameter list, though all
  three were read and are available (NZ 8 Art. 8.8.4/8.8.5, NZ 7 Art. 8.7.4/8.7.5/8.7.10,
  NZ 5 Art. 8.5.5, NZ 9 Art. 8.9.5, NZ 4 Art. 8.4.4, NZ 1 Art. 8.1.3).

---

## 12. Files produced

```
docs/04-reference/jurisdictions/es/es-md/28079-madrid/extracted/
  nz4.json           19 records   (hand-written)
  nz8.json           92 records
  nz7.json           31 records
  nz5.json           27 records
  nz9.json           62 records
  nz1.json           51 records
  nz3-refusal.json    0 records + 11 cited refusal-evidence quotes
tools/madrid-extract/
  index_pdf.py       structure / page / grep / table probe
  build_records.py   emits nz1, nz5, nz7, nz8, nz9
  validate.py        citation + ratio check (exit 1 on any uncited non-null)
```

Rerun: `python tools/madrid-extract/build_records.py && python tools/madrid-extract/validate.py`
