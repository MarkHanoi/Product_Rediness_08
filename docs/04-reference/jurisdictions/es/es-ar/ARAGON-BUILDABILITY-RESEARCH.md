# ARAGÓN — BUILDABILITY RESEARCH SUMMARY

**Status**: ⭐ **L1 — vector layer MEASURED**, with one promising but **UNVERIFIED** route to richer
planning parameters. **SEQUENCED, NOT PARKED** — Phase B, immediately after Catalunya's A2.
**Related**: [REGIONAL-INTAKE-LIST](../../../standards/REGIONAL-INTAKE-LIST.md) ·
[ADR-0293 per-dimension tiering](../../../../02-decisions/adrs/ADR-0293-envelope-tier-is-per-dimension-and-keyed-on-error-direction.md) ·
[ES-ALL-REGIONS-STATUS](../ES-ALL-REGIONS-STATUS.md) ·
[ES-LEGAL-COUNSEL-QUESTIONS Q4](../ES-LEGAL-COUNSEL-QUESTIONS-2026-08-02.md)

> ⭐ **ARAGÓN IS NOT CLOSED AS IMPOSSIBLE. IT IS BLOCKED BY MISSING EVIDENCE, NOT BY EVIDENCE OF
> ABSENCE.** It has moved from *"likely impossible with available data"* to **"promising but
> unverified."**

⛔ **ORDER IS NOT NEGOTIABLE: CATALUNYA A2 BEFORE ARAGÓN B1.** Catalunya has **24 municipalities one
run away from being measured**; Aragón has **zero envelopes and three unrun tests.**

---

## Evidence ledger — ⛔ `MEASURED` / `READ` / `UNKNOWN`, never conflated

| MEASURED | READ | UNKNOWN |
|---|---|---|
| Parcel geometry · planning polygons · vector parameter coverage · classification coverage · `fiab_geom` population · **schema null behaviour** | NOTEPA definitions · the ficha URL pattern · archive endpoint patterns · `CMUNIINE` | ficha **contents** · height · FAR · occupation · setbacks · buildable depth · **article provenance** · governing instrument chain · **the legal meaning of `fiab_geom`** |

---

## 1 · Parcel geometry — ✅ MEASURED, complete

**Catastro INSPIRE**, national. **No Aragón-specific work required.**

## 2 · Planning polygons — ✅ MEASURED

**SIUa** serves regional planning polygons via **WMS `GetFeatureInfo`**. ⚠ **No WFS available.**
Sample: **78 records across 16 municipalities.**

## 3 · Vector audit — ⛔ the buildability fields are effectively EMPTY

| Field | Valid rate |
|---|---:|
| `edificab` | **1.3 %** |
| `aprove` | **0.0 %** |
| `densidad` | **1.3 %** |

**The fields EXIST. The values do not.** *Schema ≠ corpus* — report them separately, always.

## 4 · ⭐ THE METHODOLOGICAL DISCOVERY — and it is now a project-wide rule

The dataset reports **almost every numeric field as populated.** **That is misleading.**

> **70 of 78 records have `shape_area > 0` AND `perimeter == 0`.** ⛔ **Geometrically impossible.**

⇒ ⭐ **`0` IS THIS SCHEMA'S NULL SUBSTITUTE.**

> ⛔ **THE RULE, now standing across the programme: NEVER REPORT NON-NULL RATES WITHOUT SEMANTIC
> VALIDATION. Populated is not present. Validate for internal contradiction.**

## 5 · Classification — ✅ genuinely populated

| Field | Coverage |
|---|---:|
| `clase` | **100 %** |
| `notepa` | **97.4 %** |

⇒ **Aragón successfully serves CLASSIFICATION. It does NOT serve BUILDABILITY** in the measured
vector layer. *(Same shape as SIU nationally — L2-for-determinations, not envelopes.)*

## 6 · `fiab_geom` — ⛔ **UNKNOWN, and it is a CEILING**

**Present on 100 % of records. Reads `"Aprobada"` on 21.8 %.**

Candidate meanings — **legal approval status** · **geometry quality** · **digitisation confidence**.
⛔ **Completely different regions depending which it is.**

> ⚠ **IF IT MEANS APPROVAL STATUS, ARAGÓN CAPS AT 21.8 % REGARDLESS OF EVERYTHING ELSE IN THIS
> DOCUMENT.**

## 7 · NOTEPA — **Decreto 78/2017**

Standardises planning terminology and cartography; **Art. 7** defines *edificabilidad*, gross FAR, net
FAR, buildable floor area.

⚠ ⭐ **NOTEPA STANDARDISES DRAFTING, NOT PUBLICATION.** Standard definitions existing **does not mean
the values are published in SIUa.** *Mandated ≠ served* — the Galicia finding, third occurrence.

## 8 · ⭐ THE DISCOVERY — an official ficha URL pattern

Aragón Open Data's RDF for **Fraga, INE 22112** publishes:

```
https://idearagon.aragon.es/fichaDescarga/fichaDescarga_22112.html
```

⭐ **The pattern is `fichaDescarga_<CMUNIINE>.html` — an OFFICIALLY PUBLISHED pattern, not an
inference.**

⛔ **THE EARLIER 404s WERE A PATH-SHAPE ERROR:** `fichaDescarga/` was treated as a **directory** when
it is a **file prefix**. **Logged as a negative-proof condition** alongside *axis order*, *CRS
family*, *alternate parameterisation*, and *bbox-vs-attribute filter*.

⚠ **Contents NOT inspected. Status `READ`, not `MEASURED`.** ⚠ Host is **robots-disallowed to
crawlers** — fetch with a browser UA.

## 9 · Archive structure — READ, not exercised

```
Municipality (CMUNIINE) → Planning instrument → Expediente (CODEXP) → Document
```

## 10 · ⭐ THE HYPOTHESIS THAT DECIDES THE COST MODEL

**Aragón may need a SIMPLER envelope engine than Catalunya.** Catalunya depends on street alignment,
buildable depth, **block-ring reconstruction**, closed-block form. Much of Aragón may instead be
**parcel/setback-based** — front/rear/side setbacks, occupation, height, FAR.

⭐ **If true, Aragón needs LESS than Catalunya: no block ring, no dissolve, no Art. 242.2 equivalent,
no street-width ladder.** ✅ **PRYZM ALREADY HAS THAT PATH** — `esBarcelona20aAillada` is
`kind: 'setback'`, and `requiresBlockRing` routes such rules **away** from block construction
(**§L-591**).

⚠ **HYPOTHESIS until a representative municipal ordinance is examined.**

---

## Phase B — the three measurements, each cheap, each able to stop the chain

**B1 · Fetch the Fraga ficha** (browser UA). Report: **content or shell** · does it carry
`altura` / `plantas` / `edificabilidad` / `ocupación` · ⛔ **VALID rates, never non-null.** Then **two
more `CMUNIINE` codes** to confirm the pattern generalises.

**B2 · Read Fraga's PGOU Normas Urbanísticas, residential zones only. ONE question:**
> ⭐ **Setback-based (*edificación aislada*), or alignment-and-depth?**

**This single answer decides Aragón's cost model. One document — not a 20-municipality survey.**

**B3 · Resolve `fiab_geom`.** Take it from any data dictionary B1/B2 surfaces. Otherwise **record it as
the open blocker with its consequence stated.**

## Phase C — envelopes, only if B1 and B2 land

Full chain on **Fraga**: parcel → SIUa zone → instrument → ordinance → **article** → envelope with
citations. Then test generalisation on a **second, STRATIFIED municipality — not the capital.**

> ⛔ **STATE THE CEILING IN THE OUTPUT so nobody inherits an optimistic reading:** a ficha carries
> **FAR, height and occupation — a massing box.** **Depth, setbacks and alignment live in the Normas
> Urbanísticas.** And **there is NO article provenance across 731 corpora** — Barcelona's supersession
> audit ran **1,755 → 773 → 147** for **ONE municipality with ONE corpus**, one candidate an
> **image-only scan that failed the digit-integrity gate**.

⇒ ⭐ **Under [ADR-0293] the honest tier is INDICATIVE until article provenance exists.**

---

## Capability, stated as the evidence supports

| Question | Answer |
|---|---|
| **Indicative massing?** | ⚠ **UNKNOWN** — feasible *if* fichas expose height + FAR + occupation. **Not demonstrated.** |
| **Legally defensible envelopes?** | ⛔ **NO EVIDENCE YET.** Missing article-level citations, paragraph references, governing-instrument selection, verified current legal status. |

⭐ **The critical question is no longer whether Aragón HAS a planning information system — it clearly
does — but whether that system PUBLISHES the normative buildability parameters needed to move from
planning polygons to parcel-level envelopes.**

---

# MEASURED 2026-08-02 - A1/A2/A3 RESULTS. Three answers, and two of them are ceilings.

## A3 - `fiab_geom` = **LEGAL APPROVAL STATUS**. RESOLVED, NOT GUESSED. THE CEILING IS REAL.

Found in the SIUa GeoServer SLD for `SIUa:figuradeplaneamiento_fiabgeom` (`GetLegendGraphic`,
`format=application/json`). **Legend rule titles and filters, verbatim:**

| Legend title | Filter |
|---|---|
| **"Municipios con fiabilidad JURIDICA por geometria"** (layer-level) | `fiab_geom IN ('0','1','2','101','102','200','201')` |
| **"Aprobada"** | `fiab_geom = '1'` |
| **"Aprobada con prescripciones"** | `fiab_geom IN ('101','102')` |
| **"Dudosa"** | `fiab_geom IN ('2','200','201')` |
| **"No aprobada/Denegada"** | `fiab_geom = '0'` |

> **It is the FIRST of the three candidate meanings. *fiabilidad JURIDICA* - the LEGAL STANDING of
> the planning figure, carried by the geometry. NOT geometry quality. NOT digitisation confidence.**

=> **ARAGON CAPS AT 21.8 % REGARDLESS OF EVERYTHING ELSE IN THIS DOCUMENT.** The consequence was
stated in advance and the condition has now been met.

**AND THE CODES ARE NOT A LINEAR QUALITY SCALE - a range filter is WRONG.** `0` = **denied**,
`1` = approved, `101/102` = approved with prescriptions, `2/200/201` = **doubtful**. A naive
`fiab_geom > 0` filter **admits DOUBTFUL plans.** Treat `0` **and the entire `2xx` family** as
non-authoritative. Schema: `xsd:int`, single attribute plus `shape`.

## A1 - The ficha RESOLVES - and carries **PROVEN ZERO** buildability

**The published pattern WORKS AND GENERALISES: HTTP 200 CONTENT on 6/6** municipalities (Fraga
22112, Zaragoza 50297, Huesca 22125, Teruel 44216, Ejea 50095, Sabinanigo 22199). **Not a shell** -
Fraga renders **139,246** visible text chars. **The earlier 404s are CONFIRMED as the path-shape
error.**

**But it is a GEODATA DOWNLOAD CATALOGUE, not a planning ficha.** VALID rate across all six, for
every term: `altura 0 - plantas 0 - edificabilidad 0 - aprovechamiento 0 - retranqueo 0 - fondo
edificable 0 - alineacion 0 - PGOU 0 - normas urbanisticas 0`.

**Stronger than a keyword miss:** the ficha **ENUMERATES** everything IDEAragon publishes per
municipality (~80 catalogue sections). **Exactly two are planning**, and they self-describe as
*Clasificacion de suelo, Uso global* at **1:15,000** and *Regimen Urbanistico* at **1:300,000**.

> **NEW FINDING - SCALE IS ITSELF A CEILING.** 1:15,000 geometry **is not parcel-precise,
> independent of attributes.** A layer can carry perfect fields and still be unusable for a parcel.

**AND THE `populated-is-not-present` RULE RE-FIRED ON ITS OWN ORIGIN REGION.** A naive probe reports
**`densidad` present with numbers on 100 % of fichas - 336 hits on Fraga alone.** Every one is
**`"LAS con densidad 0,5 ptos/m2"` = LiDAR POINT DENSITY.** `ocupacion` is **`"Sistema de ocupacion
del suelo"` = LAND COVER.** **Both carry numbers. Both are fabrications.** Probes must report
`label_hits` and `hits_with_number_nearby` **separately.**

**The known-answer control earned its keep:** it failed on `50095`, which returned *Ejea de los
Caballeros*. **The site was right; the expected name was wrong** (Calatayud is 50067). **Without the
control that reads as a pattern break.**

## A2 - Fraga is **`blocked`** - the record itself has no document

**Fraga's PGOU Normas Urbanisticas are NOT REACHABLE.** Its row in the official SIUa inventory
(`icearagon.aragon.es/inventarioSIUa/`) has **BOTH publication link cells EMPTY** - *Publicacion del
acuerdo AD* and ***Publicacion de las Normas Urbanisticas*** - while **neighbouring municipalities
(Abiego, Gistain, Granen, Graus) carry live BOPH/BOA links in the same columns.**

**FIGURA: PGOU - AD: 20/05/1983 - NUM.MODIF: 55.** **A 1983 pre-digital plan with 55 isolated
modifications, never retro-published. NOT A FETCH FAILURE - the record has no document.**

*Third-party search snippets hint at parameters (parcela minima 250 m2, altura 12 m) and a Plan
Director del Casco Historico. **Those are search-engine summaries of documents never opened and are
NOT findings.***

### Fallback substitute - **HUESCA capital**, clearly labelled NOT Fraga

**Read:** *Texto Refundido, Normas Urbanisticas, PGOU 2008* (2.1 MB PDF, `pdftotext -layout`).

| Cap. | Norma Zonal | Model |
|---|---|---|
| 8.1 | Edificacion Tradicional | **alignment** |
| 8.2 | Transformacion en Barrios | **alignment** |
| 8.3 | Vivienda Unifamiliar | **setback** |
| 8.4 | **Manzana Cerrada** | **alignment + depth** |
| 8.5 | Bloque Abierto | **setback** |
| 8.7 | Actividades Economicas | non-residential |

> **VERDICT: BOTH - AND CLOSED-BLOCK DOMINATES THE CONSOLIDATED RESIDENTIAL FABRIC.**
> **THE "ARAGON NEEDS LESS THAN CATALUNYA" HYPOTHESIS IS NOT SUPPORTED HERE.** Art. 8.4.8 uses
> ***alineacion oficial* + *linea de fondo edificable*** - **the same machinery as Barcelona's
> Art. 242.** Grado 2 fixes *el fondo maximo* at **20 m**.

**AND THE SAME STRUCTURAL TRAP AS BARCELONA:** the 20 m is **a DEFAULT**; the operative value is
*"definido graficamente en el **plano no5**"*. **THE NUMBER LIVES IN THE PLAN SHEET, NOT THE
PROSE** - unreadable from the normas text alone.

**One municipality is not a region.** Huesca is the capital and was chosen for downloadability, not
by stratified draw. **The typology question remains UNKNOWN for Aragon as a whole.**
