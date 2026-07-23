# Córdoba PGOU-2001 — the 15-ordinance OCR / VISION extraction + pilot-area resolution

> **Stamp** 2026-07-23 · **Status** RESEARCH FINDINGS — machine-extracted, **NOT human-verified**.
> **Governs nothing.** Every numeric value below is `pipeline-extracted-unverified` (the tier defined in
> `docs/04-reference/ORDINANCE-EXTRACTION-PIPELINE.md §3`): OCR/vision-read from a scanned PDF, gated by
> the cheap auto-checks, and awaiting a human sign-off against the source crop. A wrong number here is
> **our pipeline's error**, so it is marked unverified until a human confirms it (§CONTEXT-DATA-HONESTY).
>
> **Supersedes** the prior "numbers are in scanned PDFs, unextracted" state (`README.md`, `NEXT.md §3.1`).
> The extraction is now done; verification and wiring are not.
>
> Confidence tags: **READ-CLEAN** = extracted from a legible source, passed all auto-gates ·
> **FLAGGED** = extracted but routed to human by a gate (out-of-range / algorithm / attribution risk) ·
> **NOT-EXTRACTABLE** = the number is not in the document we hold (deferred / dead link / protection regime).

---

## 0 — One-paragraph result

All **15** `coaco:ordenanzas.link` PDFs were fetched and read. Two are **born-digital text**
(`O_INDUSTRIAL`, `O_UAD3` — trivially readable, the `L-590g` "no text layer ≠ hard" prediction holding);
ten are **pristine clean rasters** (born-digital scans, read by rendering to PNG at 200 dpi and
vision-reading — every one fully legible, zero OCR-accuracy loss on the numeric fields); **two links are
dead** (`O_UAD1`, `O_UAS1` → 69-byte "Server under construction" HTML). Across the readable set, the
buildable-envelope parameters (edificabilidad, altura/plantas, ocupación, retranqueos, parcela mínima,
usos) extracted **cleanly** for the detached/attached residential families (**Plurifamiliar Aislada,
Ordenación Abierta, Unifamiliar Adosada**) and the low-rise historic family (**Colonia Tradicional
Popular**), and **partially** for the dominant closed-block family (**Manzana Cerrada** — its height is a
per-street-width TABLE, not a scalar, and its edificabilidad is DERIVED for three of four subzones). Four
families are **NOT extractable** (Campo de la Verdad → deferred to the Conjunto Histórico Tomo VI we do not
hold; Uso Comercial → context-dependent; Elemento Protegido → a preservation regime, not an envelope;
Unifamiliar Aislada → dead link). Measured against the **5,725 Catastro parcels** of the Sur+Noroeste
pilot (**~1.63 km², 2 of ~10 districts — NOT the whole city**): **~19% get a fully-specified numeric
envelope, ~89% get at least a partial one, ~11% cannot be extracted.**

---

## 1 — The document corpus (Stage-1 profile, per `PIPELINE §2 stage 1`)

The `coaco:ordenanzas` layer's 453 polygons carry **15 distinct `link` filenames** but only **12 distinct
readable documents** (five `O_MC*` names, one Manzana-Cerrada chapter). Two axes recorded per document:
`has_text_layer` and `image_regime` — orthogonal, as the pilot insisted.

| link file | family (polygons) | bytes | pages | regime | read method |
|---|---|---|---|---|---|
| `O_INDUSTRIAL.pdf` | Uso Industrial (1) | 40 KB | 6 | **born-digital-text** (23 620 chars) | text pull (+ CP1252→UTF-8 mojibake, the `ï¿½` fix) |
| `O_UAD3.pdf` | Unifamiliar Adosada (8) | 344 KB | 3 | **born-digital-text** (8 021 chars) | text pull |
| `O_MC.pdf` `O_MC1` `O_MC2` `O_MC3` `O_MC4` | Manzana Cerrada (226) | 1.24 MB ea. | 3 | **clean-raster** | render 200 dpi → vision. **All five are the SAME 3-page chapter** (identical byte size; `MC3`≡`MC4` identical md5; `MC`/`MC1`/`MC2` differ only in scan metadata). The filename suffix routes the polygon to subzone MC-1/2/3/4; the document is one. |
| `O_CTP1.pdf` | Colonia Tradicional Popular (99) | 3.16 MB | 6 | **clean-raster** | render → vision |
| `O_OA1.pdf` | Ordenación Abierta (43) | 526 KB | 2 | **clean-raster** | render → vision |
| `O_PAS2.pdf` | Plurifamiliar aislada (30) | 762 KB | 3 | **clean-raster** | render → vision |
| `O_PTC.pdf` | CTP1-Campo de la Verdad (16) | 92 KB | 1 | **clean-raster** | render → vision |
| `O_COMERCIAL.pdf` | Uso Comercial (8) | 675 KB | 1 | **clean-raster** | render → vision |
| `O_EP.pdf` | Elemento protegido (7) | 3.65 MB | 8 | **clean-raster** | render → vision |
| `O_UAD1.pdf` | Unifamiliar Adosada (14) | **69 B** | — | **DEAD** ("Server under construction") | content recovered: UAD-1 subzone is INSIDE `O_UAD3` |
| `O_UAS1.pdf` | Unifamiliar Aislada (1) | **69 B** | — | **DEAD** | not recoverable — no held document contains the UAS chapter |

Source of all bodies: **PGOU-Córdoba-2001, Texto Refundido Oct. 2002, "Normativa: Usos Ordenanzas y
Urbanización"**, Gerencia de Urbanismo, Ayuntamiento de Córdoba. Article numbers cited below are the
document's own. Retrieved 2026-07-23 from `http://visor.pgou.coacordoba.org/doc/ordenanzas/`.

⚠ **Heterogeneity note for the pipeline enumerator** (`PIPELINE` WIRING-TODO 4): the Córdoba corpus is
NOT uniformly scanned. It mixes born-digital text, clean rasters, **duplicate filenames for one document**,
and **dead links whose content lives in a sibling file** — the enumerator must dedupe by content hash and
must not treat a `link` 200/404 as ground truth for "family covered".

---

## 2 — The extracted envelope, per family (the value table)

Locale normaliser applied (comma-decimal → period). Range gates: FAR ∈ [0.2, 3.0]; height ∈ [3, 120] m;
ocupación ∈ [0, 1]. Algorithm-detector fires on *"resultante de la aplicación de …"* → `value: null,
rule: 'derived'` — **never a number**.

### 2.1 — Plurifamiliar Aislada (PAS) — `O_PAS2`, Art. 13.7 — ⭐ READ-CLEAN, fully specified

Detached residential blocks; the cleanest extraction (every field a stated scalar or an honestly-derivable
formula). Subzones PAS-1/2/3.

| field | PAS-1 | PAS-2 | PAS-3 | article |
|---|---|---|---|---|
| edificabilidad neta (FAR, m²t/m²s) | **1,2** | **1,66** | **2,00** | 13.7.2.1 |
| ocupación máxima | **40 %** | **50 %** | **40 %** | 13.7.2.4 (hard cap 60 %, 13.7.2.5.d) |
| nº plantas / altura | **PB+3 / 12,75 m** | **PB+3 / 12,75 m** | **PB+5 / 19,50 m** | 13.7.3.3 |
| retranqueo a alineación (front) | **3 m** | 3 m | 3 m | 13.7.3.1.a |
| separación a linderos privados (side/rear) | **½·altura** (= 6,375 m @ max h) | ½·h (6,375) | ½·h (9,75) | 13.7.3.1.b |
| parcela mínima | 2 000 m² | 1 500 m² | 3 000 m² | 13.7.2.2 |
| uso dominante | Residencial Plurifamiliar (+ compat. industria 1ª, terciario, equip., aparc.) | | | 13.7.4 |

Note: the lateral/rear setback is the **rule** *½ of total building height*; the metre value shown is that
rule evaluated **at max height** — the maximal envelope. A shorter building needs less, so a scalar
under-states buildability at lower heights (the safe direction, C58 §1.4).

### 2.2 — Ordenación Abierta (OA) — `O_OA1`, Art. 13.6 — READ-CLEAN

Open blocks in free space. Subzones OA-1/2.

| field | OA-1 | OA-2 | article |
|---|---|---|---|
| edificabilidad neta (FAR) | **1,4** | **1,6** | 13.6.2.2 |
| ocupación máxima | **40 %** (all floors) | 40 % | 13.6.2.3 (cap 60 % sótano garaje) |
| altura | **PB+3 (12,5 m) … PB+6 (21 m max)** | idem | 13.6.3.1 |
| separación a linderos privados | **≥ ½·altura, min 3 m** (= 10,5 m @ max h) | idem | 13.6.3.3 |
| relación a vial (front) | not stated (open block) → null | **alineada a vial (0)** | 13.6.3.2 |
| parcela mínima | 600 m² (círculo Ø25 m) | per Unidad de Actuación | 13.6.2.1 |
| uso dominante | Residencial Plurifamiliar (+ compat.) | | 13.6.4 |

Height is a band whose top is **PB+6 / 21 m** — that ceiling is the envelope max; the actual height is
"the result of distributing the floor area", so 21 m is an honest upper bound, not a fixed value.

### 2.3 — Unifamiliar Adosada (UAD) — `O_UAD3` (born-digital), Art. 13.9 — READ-CLEAN

Row houses. Subzones UAD-1/2/3. ⚠ **The dead `O_UAD1` link is recovered here** — the one `O_UAD3`
document contains all three subzones, so the 14 UAD-1 parcels are covered despite their link 404.

| field | UAD-1 | UAD-2 | UAD-3 | article |
|---|---|---|---|---|
| edificabilidad (FAR) | **1,0** | **0,7** | **1,0** | 13.9.2.3 |
| ocupación máxima | **60 %** | **40 %** | **60 %** | 13.9.2.2 |
| altura / plantas | **PB+1 / 7 m** | PB+1 / 7 m | PB+1 / 7 m | 13.9.3.5 |
| retranqueo de fachada (front) | **4 m** | **5 m** | **0 (alineación a vial)** | 13.9.3.2 |
| lateral (adosada) | **party-wall (medianera, 0)** | party-wall | party-wall | 13.9 (adosada) |
| separación lindero fondo (rear) | **5 m** | **6 m** | **5 m** | 13.9.3.4 |
| profundidad máx edificable | 16 m | 18 m | 16 m | 13.9.3.3 |
| parcela mínima | 180 m² | 300 m² | 160 m² | 13.9.2.1 |
| fachada mínima | 6,5 m | 8 m | 6 m | 13.9.2.1 |
| uso dominante | Residencial Unifamiliar (+ compat.) | | | 13.9.5 |

### 2.4 — Colonia Tradicional Popular (CTP-1) — `O_CTP1`, Art. 13.8 — READ-CLEAN except edificabilidad (DERIVED)

Low-rise traditional fabric — the **most common family by parcel** (52.9 %). Front on the street line.

| field | CTP-1 | article | flag |
|---|---|---|---|
| edificabilidad neta | **null — DERIVED** *"El techo edificable será el resultante de la aplicación de las Normas de Composición"* | 13.8.2.3 | 🔴 algorithm |
| ocupación máxima | **step-function of parcel size:** ≤100 m² → 100 %; 100–125 m² → 100 %; **>125 m² → 80 %** | 13.8.2.5 | approximation risk |
| altura / plantas | **PB+1 / 7 m** (cumbrera 9,75 m for attic) | 13.8.3.1 | READ-CLEAN |
| profundidad máx edificable | **16 m** from vial alignment | 13.8.2.4 | READ-CLEAN |
| alineación (front) | fachada **on the vial line** (0), except groups with front garden | 13.8.2.1 | READ-CLEAN |
| parcela mínima | 70 m² | 13.8.2.2 | READ-CLEAN |
| uso dominante | Residencial Unifamiliar (+ compat.) | 13.8.5 | READ-CLEAN |

### 2.5 — Manzana Cerrada (MC) — `O_MC*`, Art. 13.5 — PARTIAL: coverage clean, height is a TABLE, edificabilidad DERIVED

Closed urban block — the largest family by area (27.2 %). Subzones MC-1/2/3/4. Front on the vial line.

| field | MC-1 | MC-2 | MC-3 | MC-4 | article |
|---|---|---|---|---|---|
| edificabilidad neta | **null — DERIVED** (*"no se fija … resultante de las Normas de composición"*) | null — DERIVED | **3,50** 🔴 | null — DERIVED | 13.5.2.2 |
| ocupación (planta baja / plantas altas) | 100 % / **70 %** | 100 % / **70 %** | 100 % / **70 %** | 100 % / **90 %** | 13.5.2.5 |
| altura / plantas | **per-street-width TABLE → null scalar** | table | table | table | 13.5.3.1 |
| alineación (front) | vial line (0) | 0 | 0 | 0 | 13.5.2.3 |
| parcela mínima | 150 m² | 150 m² | 500 m² | — | 13.5.2.1 |
| uso dominante | Residencial Plurifamiliar (+ compat.) | | | | 13.5.4 |

🔴 **MC-3 FAR 3,50 exceeds the range gate [0.2, 3.0]** → auto-gate routes it to a human. The read is
confident (*"En MC-3 la edificabilidad neta será 3,50 m2/m2"*, top of p. 49) — a legitimate high-density
subzone — but auto-accept is OFF for it per the gate. Exactly the gate working as designed.

⚠ **The MC height table (Art. 13.5.3.1), transcribed for the record but NOT emitted as a scalar** — a
per-street-width CONSTRUCTION like Barcelona's:
- **MC-1:** ≤8 m→PB+2/9,75 m · ≤10→PB+3/12,75 · ≤14→PB+4/16,75 · ≤16→PB+5/19,50 · >16→PB+6/22,50
- **MC-2 & MC-4:** ≤10 m→PB+2/9,75 · >10→PB+3/12,75
- **MC-3:** ≤10→PB+2/9,75 · ≤15→PB+3/12,75 · ≤20→PB+4/16,75 · >20→PB+5/19,50

Encoding any single height as `maxHeight_m` would publish one street's answer for the whole zone — the
L-526 failure. It stays **null** until a Córdoba street-width resolver exists (the same gap as Barcelona
`bcnAlcadaNucliAntic.ts`).

### 2.6 — Uso Industrial (IND) — `O_INDUSTRIAL` (born-digital), Art. 13.11 — READ-CLEAN but ocupación DERIVED + subzone-unbindable

Only **1 calificación polygon / 1 parcel**, and the calificación `ordenanza="Uso Industrial"` does **not**
say which subzone (IND-1/2/3/G/C/SC-C), so the parcel **cannot be bound** to a numeric set. Values recorded
for the SPEC, not packed:

| subzone | parcela mín | edificabilidad | ocupación | altura |
|---|---|---|---|---|
| IND-1 escaparate | 750 m² (fachada 20 m) | 1,16 | 🔴 **DERIVED** *"resultante de la aplicación de los parámetros"* | 15 m (excep. 20) |
| IND-2 pequeña/media | 250 m² | 1,5 | 🔴 DERIVED | 15 m (excep. 20) |
| IND-3 pesada | 2 000 m² | 1,5 | 🔴 DERIVED | 15 m (excep. 20) |
| IND-C Santa Cruz | 200 m² | 1,0 | **100 %** (stated) | 7,50 m naves |
| IND-SC-C | 500 m² | 1,0 | **100 %** | 7,50 m |
| IND-G est. servicio | — | ≤ 0,35 | deferred to Plan Especial | — |

🔴 **The sufficiency trap, verbatim** — IND-1/2/3 ocupación is *"la resultante de la aplicación de los
parámetros de edificación del presente artículo"*: an **algorithm, not a number**. A pack MUST leave it
`null`. This is the family the task named as the confident-wrong risk, and it is real here.

### 2.7 — NOT-EXTRACTABLE families

| family (parcels) | why not | what IS known |
|---|---|---|
| **CTP1-Campo de la Verdad** `O_PTC` (85) | Art. 13.4.1: envelope is *"en la Memoria y Normativa correspondiente al Conjunto Histórico (Tomo VI)"* — a document **we do not hold** (the PEPCH-adjacent historic trap). | parcelación régimen only = CTP (70 m²). Borrowing CTP's altura/ocupación would be **confident-wrong**. |
| **Uso Comercial** `O_COMERCIAL` (91) | Art. 13.12.2: a use overlay. Commercial buildings in MC/CTP/UAD/UAS/IND **follow the underlying zone**; in PAS/OA a specific set; standalone parcels defer to Plan Parcial. **Context-dependent**, not one envelope. | the suelo-urbanizable set (parcela 400, FAR 1,5, ocup. PB 100/PA 50, altura 12 m, sep. 6 m) exists but is **wrong to apply to urban parcels**. |
| **Elemento protegido** `O_EP` (7) | Art. 13.3: a **preservation regime** (grados 1–6 of mejora/reforma/obra nueva). *"La sustitución no supondrá aumento de la superficie total ni del volumen construidos"* — there is **no new private envelope**; the envelope is the existing building. | → a `not-determined` / no-private-envelope refusal, not an estimate. |
| **Unifamiliar Aislada** `O_UAS1` (4) | **dead link**, and no held document contains the UAS chapter. | nothing — genuinely unextracted. |

---

## 3 — Auto-gate summary (`PIPELINE §2 stage 4`)

| gate | result |
|---|---|
| **Locale normaliser** | applied to all comma-decimals (1,16→1.16; 3,50→3.50; 12,75→12.75). 0 errors. |
| **Range: FAR ∈ [0.2,3.0]** | **1 FLAG** — MC-3 = 3.50 (real, routed to human). All others in-range. |
| **Range: height ∈ [3,120] m** | 0 flags (7 … 22,50). |
| **Range: ocupación ∈ [0,1]** | 0 flags (0.40 … 1.00). |
| **Algorithm detector** | **3 families / 5 fields FLAGGED → null**: IND-1/2/3 ocupación; MC-1/2/4 edificabilidad; CTP-1 & CTP-C edificabilidad. All state *"resultante de la aplicación de …"*. |
| **Attribution / binding** | **2 FLAGS**: (a) the single Industrial parcel cannot be bound to an IND subzone; (b) CTP-1 ocupación is a step-function of parcel area, so a scalar 0.80 is an approximation (under-states small parcels — safe). |
| **Dual-source corroboration** | not run (single-source document); every value is single-pass vision/text, hence `pipeline-extracted-unverified`, hence human-verify-before-ship. |

**No value was auto-accepted as certified.** Confident-wrong rate cannot be quoted without the human pass;
the *design* keeps it near-zero by refusing to emit a number for any DERIVED / out-of-range / unbindable
field.

---

## 4 — Pilot-area resolution (the number, denominator NAMED)

**Denominator = the 5,725 Catastro parcels of `coaco:vcatastro_urbanismo`** — the Sur + Noroeste pilot,
**~1.63 km², 2 of Córdoba's ~10 districts, NOT the casco histórico, NOT the whole municipality.** Each
parcel carries an `ordenanza` field; counts are live (2026-07-23):

| ordenanza | parcels | % of pilot | envelope status |
|---|---|---|---|
| Colonia Tradicional Popular | 3 027 | 52.9 % | **partial** (altura 7 m + ocupación + depth 16 m; FAR derived-null) |
| Manzana Cerrada | 1 005 | 17.6 % | **partial** (coverage + use; height street-table-null; FAR derived except MC-3) |
| Ordenación Abierta | 607 | 10.6 % | **full** |
| Unifamiliar Adosada | 448 | 7.8 % | **full** |
| *(blank — no ordenanza)* | 422 | 7.4 % | none |
| Uso Comercial | 91 | 1.6 % | not-extractable |
| CTP1-Campo de la Verdad | 85 | 1.5 % | not-extractable (historic-deferred) |
| Plurifamiliar aislada | 35 | 0.6 % | **full** ⭐ |
| Unifamiliar Aislada | 4 | 0.1 % | not-extractable (dead link) |
| Uso Industrial | 1 | 0.0 % | subzone-unbindable |

**The honest resolution, three tiers:**
- **Fully-specified numeric envelope** (OA + UAD + PAS + IND) = 1 091 parcels = **19.1 %**.
- **At least a partial envelope** (add CTP-1 + MC — real coverage/height/depth, one field derived-null) =
  5 123 parcels = **89.5 %**.
- **Not extractable** (blank + Comercial + Campo de la Verdad + Unif. Aislada) = 602 parcels = **10.5 %**.

⚠ **This is the PILOT area only.** Whole-city: the calificación geometry is published for **only these 2
districts** (`CALIFICACION-ENDPOINT-PROBE.md §5`). Elsewhere in Córdoba the best available answer is **SIU
clasificación** (land class, no envelope). So the municipality-wide fraction with an extractable envelope is
**far below 19 %** — it is 19 %/89 % *of the 1.63 km² pilot*, and effectively **0 %** of the ~10× larger
consolidated urban area outside Sur+Noroeste until COACo extends the pilot or the PGOU PDFs are curated
per-district from SITUA.

---

## 5 — Córdoba's max honest potential (stated both ways)

- **Pilot area (Sur + Noroeste, ~1.63 km², 5 725 parcels):** with human verification of the values in §2,
  Córdoba can ship a **`pipeline-extracted-unverified` → (post-sign-off) `estimated-ruleset`** envelope for
  **~89 % of parcels** (**~19 % fully numeric**, the rest partial with a documented derived/tabular gap).
  This is a **shape-B "modern consolidated plan, clean ordinances"** city (`PIPELINE §6.5`): the OCR burden
  is low, the documents are clean, and the numbers are keyed to a live GIS calificación — the highest-leverage
  case for the pipeline.
- **Whole municipality:** **~0 % today** — calificación geometry exists for 2 of ~10 districts only. The
  wall is **not OCR** (that is now solved) but **pilot COVERAGE**. Unblocking is COACo extending the pilot,
  or per-district curation of the PGOU-2001 PDFs (same clean documents) against SITUA parcel geometry.

The four not-extractable families are each a **different, honest kind of "no"**: a historic regime deferred
to a document we lack (Campo de la Verdad), a context-dependent overlay (Comercial), a preservation regime
with no new envelope (Elemento Protegido), and a dead link (Unifamiliar Aislada). None is a data-quality
excuse; each is a cited reason.

---

## 6 — Reproduction

```bash
UA="Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120 Safari/537.36"
BASE="https://geoserver.pgou.coacordoba.org/geoserver/wfs?service=WFS&version=2.0.0&request=GetFeature"
# ordenanza->link map (15 distinct filenames, 12 distinct documents):
curl -A "$UA" "$BASE&typeNames=coaco:ordenanzas&propertyName=ordenanza,link&outputFormat=csv"
# the 12 readable PDFs (2 born-digital text, 10 clean rasters); O_UAD1/O_UAS1 = 69-byte dead HTML:
curl -A "$UA" "http://visor.pgou.coacordoba.org/doc/ordenanzas/O_PAS2.pdf" -o O_PAS2.pdf
# pilot parcel denominator + per-family counts (5 725 parcels):
curl -A "$UA" "$BASE&typeNames=coaco:vcatastro_urbanismo&resultType=hits"              # numberMatched=5725
curl -A "$UA" "$BASE&typeNames=coaco:vcatastro_urbanismo&propertyName=ordenanza,sup_pc_m2&outputFormat=csv&count=6000"
# read a born-digital file directly; render a raster to PNG then vision-read:
python -c "import fitz;print(fitz.open('O_INDUSTRIAL.pdf')[0].get_text())"
python -c "import fitz;fitz.open('O_PAS2.pdf')[0].get_pixmap(dpi=200).save('pas_p1.png')"
```

**Related:** `ORDENANZA-PACK-SPEC.md` (the pack design + the starter pack) ·
`CALIFICACION-ENDPOINT-PROBE.md` (the endpoint) · `../../../ORDINANCE-EXTRACTION-PIPELINE.md` (the horizontal
capability + the `pipeline-extracted-unverified` tier) · `sources/SOURCES.md` (the source catalogue).
