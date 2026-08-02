# What can PRYZM legally compute inside NZ-3?

**2026-08-02 · L-680 · every figure measured or quoted from
[`../corpus/pdf/COMPENDIO_MPG_NNUU_24-09-2025_PGOUM-97.pdf`](../corpus/pdf/COMPENDIO_MPG_NNUU_24-09-2025_PGOUM-97.pdf)
(sha256 `1A3AA172…`, 626 pp) or from
[`../extracted/nz-land-share-and-coefz-probe.json`](../extracted/nz-land-share-and-coefz-probe.json).**

> ## THE ONE-LINE ANSWER
>
> **NZ-3 is not 60.46 % of nothing.** It is **48.380 %** of Norma-Zonal land where Chapter 8 grants
> *existing-building intervention rights with numeric ceilings PRYZM can already compute from parcel
> geometry alone*, plus **12.078 %** governed by a **different instrument** we have not yet read.
>
> **What is closed is the NEW-BUILD ZONE ENVELOPE (D-001, unchanged). What is open — and newly
> quantified — is an INTERVENTION CEILING on ~48 % of NZ land.**

⚠ **The founder's correction was right and my "NZ-3 closed" framing was wrong.** I equated *60.46 %
of land* with *60.46 % of envelope opportunity*. Chapter 8 answers one question — *may a generic
zone-level new-build envelope be published?* — and I let that answer stand in for six other
questions it never addressed. D-001 is **not** reversed; a **different output** now sits beside it.

---

## §1 — TASK 2 (as reframed): the administrative evidence chain

**The question.** Does Art. 8.3 prohibit only the *creation of a new zoning envelope*, or also
*computing the lawful envelope of the existing building from authoritative geometry*?

**Method (per the founder's reframe): do not hunt GIS layers — reconstruct what a municipal planner
actually uses.** The Compendio is the authority on its own procedure and it was searched
exhaustively for the evidence chain.

### VERDICT: **OUTCOME B — case-specific, applicant-supplied survey.**

**Three findings, each verbatim:**

**1. The NNUU do not define the licensing evidence chain at all — they delegate it, twice.**

> «Artículo 8.2.11 **Tramitación de licencias** (N-2) … señalen las presentes Normas y la
> **Ordenanza Especial de Tramitación de Licencias**» — p. 392
>
> «del artículo 6 de la **Ordenanza Municipal de Tramitación de Licencias Urbanísticas de 24 de
> diciembre de 2004 (OMTLU)**» — p. 571

and above both, the regional statute: **Ley 9/2001 LSCM Art. 151** («*están sujetos a previa
licencia urbanística todos los actos de usos del suelo, construcción y edificación*», p. 571).
**⇒ the documentation requirements live in the OMTLU, which PRYZM does not hold.**

**2. Every reference to *estado actual* documentation in the NNUU is APPLICANT-SUPPLIED.** The
decisive grammar is *«que se aporten»* — *which are submitted*:

> «se indicará en la solicitud … señalando su situación en los **planos topográficos de estado
> actual que se aporten**» — p. 239
>
> «reportaje fotográfico completo, **planos del estado actual**, estudio histórico del elemento» — p. 161
>
> «Además de la **documentación del estado actual** y del proyecto que para cada tipo de obras…» — p. 392

**3. Municipal cartography appears ONLY as a locator, never as the measure of a building.**

> «**Plano de situación sobre cartografía municipal a escala 1:2.000**, señalando la finca objeto de
> estudio» — p. 178

It positions *la finca*. Nothing in the NNUU points at a municipal dataset that establishes a
building's envelope or its *superficie edificada total*.

### What this means, stated precisely

| | |
|---|---|
| **Does Art. 8.3 forbid computing the existing envelope?** | **No.** It states the criterion (*«la envolvente exterior del edificio existente … la superficie total edificada del mismo»*, 8.3.5.3.a.i) and prescribes **no measurement methodology** — the ADR-0285 situation. |
| **May PRYZM therefore publish one?** | **Not today.** ADR-0283/0288: computing an observable criterion is implementation *only from authoritative published data*. The authority's own workflow establishes the existing envelope from **applicant-submitted survey drawings**, not from a published dataset — so there is nothing authoritative to compute *from*. |
| **Is that ambiguous?** | **No, and that is the value.** D-001 hardens from *"no envelope"* to **"no AUTOMATABLE envelope, because the municipality itself does not hold one — it asks the applicant."** |

⚠ **ONE DOCUMENT WOULD MAKE THIS DEFINITIVE, AND IT IS RETRIEVABLE:** the **OMTLU (24-12-2004)**
documentation annex for an *obras* application. If it names a municipal dataset, Outcome A returns
and ~48 % of NZ land re-opens. If it lists architect-submitted drawings — which all three findings
above predict — the question closes permanently. **This is now a one-document research task with a
binary success criterion.**

⚠ **`PG_ANALISIS_EDIFICACION`'s legal status is NOT established, and I am not asserting it.** The
geoportal describes it as building-*analysis* information; my measurements show L2 *«Fondo máximo…»*
covers **≈4.9 %** of the municipality and L12 *«Fondo»* is a **single municipality-spanning polygon**
(a cartographic background). Consistent with *informational mapping*, **but consistency is not
proof** — and under ADR-0288 finding a layer is not authority to publish from it.

---

## §2 — THE ENVELOPE EVIDENCE CHAIN (per parameter)

For a **Grado 1º** parcel. ✅ = computable from data PRYZM holds authoritatively today.

| Parameter | Legal basis | Evidence required | Official dataset | Computable? | Confidence |
|---|---|---|---|---|---|
| **Parcel geometry** | — | cadastral boundary | **Catastro** (PRYZM: PARCEL axis 100 %) | ✅ **YES** | authoritative |
| **New-build zone envelope** | Art. 8.3.1 · 8.3.3.1.b | — | *none exists* | ⛔ **NO — legally absent** | D-001 |
| **Ampliación ceiling, unifamiliar** | **Art. 8.3.8.1** | *parcela edificable* | Catastro | ✅ **YES** — `0.7 m²/m²` | ordinance-stated |
| **Ocupación ceiling, unifamiliar** | **Art. 8.3.8.2** | *parcela edificable* | Catastro | ✅ **YES** — `≤ 60 %` | ordinance-stated |
| **Height ceiling, unifamiliar** | **Art. 8.3.8.3.b** | — | ordinance | ✅ **YES** — `3 plantas · 10,50 m` | ordinance-stated |
| **Ampliación ceiling, industrial** | **Art. 8.3.6.4** | *parcela edificable* | Catastro | ✅ **YES** — `≤ 2,4 m²/m²` | ordinance-stated |
| **Ampliación ceiling, dotacional** | **Art. 8.3.7.2.b** | *parcela edificable* | Catastro | ✅ **YES** — `1,6` first 2 500 m², `1,4` beyond | ordinance-stated |
| **Ocupación ceiling, dotacional** | **Art. 8.3.7.2.a** | *parcela edificable* | Catastro | ✅ **YES** — `≤ 2/3` | ordinance-stated |
| **Existing built area** (2nd ceiling) | Art. 8.3.5.1 · 8.3.8.1 | the existing building | **← THE QUESTION → applicant survey** | ⛔ **NO** | §1 |
| **Existing envelope** (substitution) | Art. 8.3.5.3.a.i | the existing building | **← same** | ⛔ **NO** | §1 |
| **Antecedent instrument** (Grado 2º) | **Art. 8.3.10.c** · 3.2.7 | the prior plan | *not held* | ⛔ **NO** | §3 |
| Setback to linderos, ampliación | Art. 8.3.8.2/3.c | parcel geometry | Catastro | ✅ **YES** — `≥ 3 m` | ordinance-stated |
| Heritage override | Art. 8.3.5.3.e/f | Catálogo / APECH | `PG_EDIFICIOS_PROTEGIDOS` (unprobed) | 🟡 **UNKNOWN** | — |

### ⭐ The dependency-graph point, which changes the product

**Six of the ceilings above are GREEN today**, on parcel geometry PRYZM already holds
authoritatively. For a Grado 1º parcel the correct output is therefore **not** *"cannot compute"*.
It is:

> **"Intervention ceiling: ≤ X m² (0,7 m²/m² of your parcel), ≤ 60 % coverage, ≤ 3 storeys / 10,50 m.
> A second ceiling — 25 % of your building's existing floor area — also applies and PRYZM cannot
> establish it, because Madrid establishes it from surveyed drawings you submit."**

That is a **real, cited, useful answer** on land currently returning a bare refusal. It is an
**upper bound** (the binding limit is the *minimum* of the two ceilings), and must ship labelled as
one — never as a determination.

### Recovery table — every missing parameter

| Missing | Why | Recoverable? | Recovery path | Success criterion |
|---|---|---|---|---|
| Existing built area / envelope | authority uses applicant survey (§1) | 🟡 **Only if OMTLU says otherwise** | retrieve **OMTLU 24-12-2004** documentation annex | it names a municipal dataset — or it does not |
| Grado 2º entitlement | delegated to antecedent plan (Art. 8.3.10.c) | 🟡 per-ámbito | identify the API/APE instruments over the 12.078 % | count how many ámbitos, then read them |
| Heritage override | `PG_EDIFICIOS_PROTEGIDOS` unprobed (P4) | 🟢 likely | one field inventory | replaces or modifies the envelope? |
| `PG_ANALISIS_EDIFICACION` legal status | documentary, unestablished | 🟢 | the dataset's own metadata / publication act | legal constraint vs informational mapping |

---

## §3 — TASK 3: every square metre of the 60.458 %, allocated

**Measured**, `SHAPE.STArea()` over all 34 `AMB_TX_ETIQ` codes; denominator = 149 577 169,5 m² of
Norma-Zonal-governed land. **Non-overlapping, sums exactly.**

| Code | *denominación* | m² | % of NZ land | % of NZ-3 | Regime |
|---|---|---:|---:|---:|---|
| **3.1.a** | ZONA 3 GRADO 1º NIVEL a | 66 694 065 | **44.588** | 73.75 | Chapter 8 direct |
| **3.1** | NZ 3.1 | 2 820 758 | **1.886** | 3.12 | Chapter 8 direct |
| **3.1.b** | ZONA 3 GRADO 1º NIVEL b | 2 258 070 | **1.510** | 2.50 | Chapter 8 direct |
| **3.1.c** | ZONA 3 GRADO 1º NIVEL c | 592 154 | **0.396** | 0.65 | Chapter 8 direct |
| | **GRADO 1º TOTAL** | **72 365 047** | **48.380** | **80.03** | **Chapter 8 direct** |
| **3.2** | ZONA 3 GRADO 2º | 18 066 267 | **12.078** | **19.97** | ⭐ **ANTECEDENT INSTRUMENT** |
| | **NZ-3 TOTAL** | **90 431 314** | **60.458** | **100.00** | |

### ⭐ Question 3 of the founder's list, ANSWERED: **19.97 % of NZ-3 is governed by a more specific instrument.**

> **Art. 8.3.10.c)** «Obras de nueva edificación: **Se regulan por las condiciones específicas del
> planeamiento inmediatamente anterior al presente Plan General**, que pueden complementarse con las
> condiciones establecidas en el artículo 8.3.5.3 … que no resulten contradictorias» — p. 405–406
>
> **Art. 8.3.10.d)** «En los casos en que el planeamiento antecedente establezca el **número máximo
> de viviendas**, su carácter vinculante se determinará en la forma que establece el **artículo 3.2.7
> para las Áreas de Planeamiento Incorporado**» — p. 406

⇒ **Grado 2º is not "no envelope" — it is "someone else's envelope"**, and 12.078 % of Madrid's
Norma-Zonal land sits there. Under Doctrine B the correct output is a **cited delegation naming the
API**, which is a better answer than today's generic refusal.

### Is the prohibition absolute or conditional? — **CONDITIONAL, and this is the crux**

**Not every parcel. It depends on whether a building already stands:**

| Parcel state | Governing article | Outcome |
|---|---|---|
| **Developed** | Art. 8.3.5 · 8.3.6/7/8 | **intervention rights WITH computable ceilings** |
| **Vacant** | **Art. 8.3.3.1.b** | «*los suelos vacantes tendrán la consideración de **espacios libres sin aprovechamiento urbanístico***» — unless the antecedent plan says otherwise |
| **Vacant, interbloque** | Art. 8.3.5.3.b | «*con carácter excepcional*» · infrastructure/garages · «*enteramente subterránea*» |

⇒ **The 60.46 % divides on a DATA question (built vs vacant), not a legal one.** That is Task 4, and
it is why Task 4 matters.

### Grades / subclasses: **YES — five codes, two grados, three niveles** (table above). Art. 8.3.2.2
establishes *«dos grados … con los códigos 1º y 2º»*; the GIS additionally publishes niveles a/b/c.

---

## §4 — TASK 1: the NZ-3 capability matrix

| Legal output | Yes | No | Unknown | Legal basis |
|---|:--:|:--:|:--:|---|
| Generic **new-build zone envelope** | | **✅** | | **Art. 8.3.1** + 8.3.3.1.b (D-001) |
| **Existing-building works** admissible | **✅** | | | Art. 8.3.5.1 (all of Art. 1.4.8) |
| **Demolition** admissible | **✅** | | | Art. 8.3.5.2 (Art. 1.4.9) |
| **Reconstruction / substitution** admissible | **✅** | | | Art. 8.3.5.3.a |
| **Substitution envelope computable** | | **✅** | | Art. 8.3.5.3.a.i — criterion stated, **datum not published** (§1) |
| **Extension (*ampliación*) admissible** | **✅** | | | Art. 8.3.5.3.c · 8.3.6/7/8 |
| **Extension CEILING computable** | **✅** | | | **8.3.6.4 · 8.3.7.2 · 8.3.8.1-3 — parcel-relative, GREEN** |
| **Underground works** | **✅** | | | Art. 8.3.5.3.b.i — «*enteramente subterránea*», ≤ 70 % of parcel |
| **Vacant-parcel entitlement** | | **✅** | | Art. 8.3.3.1.b — *espacios libres sin aprovechamiento* |
| **Another instrument governs** | **✅** | | | **Art. 8.3.10.c — Grado 2º, 19.97 % of NZ-3** |
| **Heritage interaction** | | | **🟡** | Art. 8.3.5.3.e (Cerca y Arrabal, manzana 0101003) · 8.3.5.3.f (Catálogo) — replaces or modifies? **unread** |
| **Façade reconfiguration** | **✅** | | | Art. 8.3.5.3.d — bioclimatic, *miradores* volume |
| **Parcels classifiable into computable subtypes** | **✅** | | | built vs vacant (§3) — a DATA exercise |

---

## §5 — TASK 5: per-Norma computation mode (P-004) — **is NZ-3's pattern unique?**

**No — and this is the product-model finding.** Classified by legal mode, with measured land shares.

| Mode | Normas Zonales | % of NZ land | Meaning |
|---|---|---:|---|
| **`existing-building`** | **NZ 3** (3.1.a/3.1/3.1.b/3.1.c) | **48.380** | entitlement = the standing building + a parcel-relative ampliación ceiling |
| **`instrument`** | **NZ 3 grado 2º** | **12.078** | delegated to the antecedent plan (API), Art. 8.3.10.c |
| **`explicit-area`** | **NZ 1** (1.1–1.6) | **11.695** | published footprint clipped to parcel (SIG-M2 / ADR-0283) |
| **`envelope`** | NZ 4 · 5 · 7 · 8 · 9 | **27.847** | classic parametric envelope — the 23 packed zones |
| | **TOTAL** | **100.000** | |

> ⭐ **ONLY 27.85 % OF MADRID'S NORMA-ZONAL LAND IS AN "ENVELOPE" ZONE IN THE SENSE THE PRODUCT
> ASSUMES.** 48.38 % is existing-building, 12.08 % is instrument-delegated, 11.70 % is
> explicit-area. **Treating every zone as an envelope candidate mis-models 72 % of the city.**

⚠ NZ 3 grado 1º is **not** unique in kind — NZ 2 (*Conservación del centro histórico*, Cap. 8.2) is
visibly the same shape: Art. 8.2.10's *«intervenciones … sin variar la envolvente»* is an
existing-building regime too. NZ 2 governs **0 m²** of the published layer (V13), so it costs Madrid
nothing — **but any city with a large historic core will hit this**, and the mode is a platform
concept, not a Madrid one.

---

## §6 — TASK 4: parcel classification — METHOD AND COST, deliberately not built

**Not run.** It is the *spatial reconstruction* the founder ring-fenced: cheap to describe, and its
output must never become an envelope.

**Method** — pure data, no legal claim: for each Catastro parcel whose centroid falls in an NZ-3
polygon (`AMB_TX_ETIQ` ∈ {3.1.a, 3.1, 3.1.b, 3.1.c, 3.2}), intersect with Catastro building
footprints → `Developed` (≥1 footprint, coverage ≥ 5 %) · `Partially developed` (0 < cov < 5 %) ·
`Vacant` (none) · `Unknown` (no parcel or no footprint coverage at that location).

**Cost:** ~1–2 days. Catastro INSPIRE ATOM per municipality (`CP` parcels + `BU` buildings), both
free and bulk-downloadable; ~90.4 km² of NZ-3.

⚠ **THE FOUNDER'S "95 % built-out" WAS AN EXAMPLE, NOT A FACT, AND IT IS NOT REPEATED HERE.**
Nothing in this document assumes a built-out share. What §3 establishes is only that **the split is
decidable from data** — and that Art. 8.3.3.1.b makes the answer legally load-bearing.

**Why it matters:** if NZ-3 grado 1º is largely built-out, the §2 intervention ceiling is the
*normal* case for **~48 % of Norma-Zonal land**, not an edge case — and Madrid's practical coverage
is far higher than the ENVELOPE axis suggests. If it is largely vacant, Art. 8.3.3.1.b makes most of
it *espacios libres sin aprovechamiento* and the refusal is not merely correct but complete.
**Either way the number is worth having, and it is the input to that decision, not a coverage claim.**

---

## §7 — What changed, and what did not

**UNCHANGED — D-001 stands.** Art. 8.3.1 governs; no generic new-build zone envelope exists in NZ-3;
`madridNZ3Refusal` remains correct for that question. The ENVELOPE axis does **not** move on this
document: nothing here is packed, and no gate is flipped.

**NEW:**
1. **Outcome B established** — the authority itself uses applicant-supplied survey, so the barrier
   is *automatability*, proven, not assumed (§1). One document (OMTLU) would make it final.
2. **Six intervention-ceiling parameters are GREEN** on parcel geometry we already hold (§2).
3. **19.97 % of NZ-3 is instrument-delegated**, measured, with the article (§3).
4. **The prohibition is CONDITIONAL on parcel state**, not absolute (§3).
5. **Only 27.85 % of Madrid is an "envelope" zone** — a product-model finding, not a Madrid one (§5).

---
*Authority: ADR-0283 · ADR-0285 · ADR-0288 · C58 · C63 §1.5 · D-001 · L-616 · L-656 · L-678 · L-680.
Land shares: `../extracted/nz-land-share-and-coefz-probe.json` (L-676, measured 2026-08-01).*
