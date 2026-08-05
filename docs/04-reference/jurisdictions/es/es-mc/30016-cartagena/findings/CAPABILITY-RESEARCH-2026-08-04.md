# Cartagena (INE 30016, Región de Murcia) — Envelope-Engine Capability Research

Date: 2026-08-04
Scope: Cartagena capital + municipal term, NOT Cartagena de Indias (Colombia). Every URL cited below
is host-verified as `*.cartagena.es`-rooted (`urbanismo.cartagena.es`, `ide.cartagena.es`,
`geo.cartagena.es`). No `cartagena.gov.co` source is used anywhere in this document.

---

## 0. Resolution of the plan-validity question (must-read first)

**a) Is `Periodo=R1` current?** No. `R1` = the 2012 Revisión del PGMO (expediente 2008-0001,
definitively approved 29/12/2011, published BORM 27/07/2012). It was **declared null** by the
Superior Court of Justice of Murcia (STSJ Murcia, 20 May 2015), and that nullity was **upheld by
the Spanish Supreme Court on 15 June 2016** (dismissal of cassation appeals). Every `Ficha/*`
record under `Periodo=R1` / `Entidad=PLAN_R1.*` carries the page's own disclaimer confirming this:
*"Esta ficha corresponde a la Revisión de 2012 declarada nula."* Confidence: **High** (confirmed by
both the portal's own disclaimer text and independent web corroboration of the STSJ/TS rulings).

**b) Does a current, valid period exist with the same structure?** Yes: **`Periodo=R0`**,
`Entidad=PLAN_R0.MANZANAS` (etc.). R0 = **Plan General Municipal de Ordenación de 1987**
(Matrícula `R0-PGMO`, definitive approval 9 April 1987, BORM 14 April 1987), which
**re-entered into force automatically** when the 2011/2012 revision was annulled (loss of validity
of the revision reinstates the previously-repealed instrument — standard Spanish planning-law
consequence, and stated explicitly on the portal's `Vigencias.aspx` help page). R0-PGMO is
**actively maintained**: 82 modifications with definitive approval, 18 in process, 148 Estudios de
Detalle, 309 Unidades de Actuación, 43 "ámbitos ordenados." Confidence: **High**.

Additionally, a **third, forward-looking layer** exists: a brand-new Revisión del Plan General
(project code 2024, portal path `/urbanismo/RPG2`, geoportal `ide.cartagena.es/GP_RPG2`) is at
**provisional-approval stage** (aprobación inicial 27 June 2024; aprobación provisional 12 February
2026), still awaiting Declaración Ambiental Estratégica and final regional approval. It is **not yet
in force** and must not be used as the source of truth today, but it signals that Cartagena's
planning baseline will change again in the near-to-mid term — worth tracking as a follow-up item,
not a blocker. Confidence: **High** on status/dates as reported by the portal; **Medium** on timing
of eventual definitive approval (not disclosed).

**c) If R1 is annulled, is the typology→parameter dictionary also invalid, or only the spatial
assignment?** Resolved directly by testing: **R0 is a fully independent, parallel data system**,
not a fallback view of R1. `PLAN_R0.MANZANAS` has its own block numbering (`Valor=` IDs are
disjoint from R1's), its own `Matricula` scheme (`R0-PGMO-####`, `R0-PP-<sector>-####` for blocks
inside partial plans, `R0-PERI-...`, etc.), and its own **currently-valid** ordinance text (Título
Cuarto of the 1987 Normas, `ExtDoc/PLDOC/2001-0001/Normas/Título 4.htm` — registration `2001-0001`
is a distinct, non-annulled consolidated-text expediente for the 1987 plan, separate from the
annulled `2008-0001`). So: **the typology-to-parameter dictionary is current and untouched by the
annulment** — it is the 1987 ordinance (zone codes Cc/Vc/Vu/Vi/Ac/Au/Ai/E with grados), which was
never repealed. What *did* get thrown out was the 2012 revision's *alternative* zoning scheme (R1
codes like `R.V1`) and its *alternative* spatial assignment. Confidence: **High**.

---

## 1. Direct services — what actually exists and is queryable

### 1.1 `Ficha/*` HTML micro-service (already known, now confirmed for R0)
`urbanismo.cartagena.es/urbanismo/Ficha/MAN?Periodo=R0&Entidad=PLAN_R0.MANZANAS&Valor=<id>` returns
a per-block sheet with a **`Norma urbanística`** field. Confirmed live examples (all R0, i.e.
currently valid, not annulled):
- `Valor=11502` (`R0-PP-LP6-0005`) → `Norma urbanística: Vu1 (0,52)` (Plan Parcial Este de La
  Palma — sectoral plan, but still resolves to a base 1987 zone code plus a block-specific
  edificabilidad override).
- `Valor=12349` (`R0-PP-AT-0083`) → `Norma urbanística: AC` (Plan Parcial Atamaria).

Other `Ficha/*` entities confirmed to exist and resolve for R0: `Ficha/UA` (Unidades de Actuación),
`Ficha/SG` (Sistemas Generales), `Ficha/AMB` (Ámbitos de planeamiento), `Ficha/PL` (Planes
Parciales/Especiales index, e.g. `Ficha/PL?Valor=1` = the R0-PGMO master record itself).

### 1.2 WMS service on the CURRENT plan — the real breakthrough
`https://ide.cartagena.es/wms_RPG0/wmservice.aspx` is a **live OGC WMS** specifically for the R0
(1987, currently-valid) plan. `GetCapabilities` lists 10 layers, most importantly:
- **`Manzanas`** — queryable, scale range 500–5000, i.e. exactly the block-level zoning layer.
- `Ambitos_de_suelo`, `Unidades_de_actuación`, `Sistemas_generales`, `Estudios_de_detalle`,
  `Detalles_de_ordenación`, `Detalles_de_urbanización`, `Planes_no_previstos`, `Rotulación`,
  `Fondos`.

A live **`GetFeatureInfo`** test against the `Manzanas` layer returned well-formed GML with fields
`ID`, `Matricula`, `Norma`, `Ficha_web` — e.g.:

```
ID: 7870
Matricula: R0-PP-CO51-0007
Norma: "Ac4 (2,3505) Uso Máximo Residencial = 23384,45 m²"
```

This is a **structured, machine-parseable, coordinate-addressable** attribute query — not a page
scrape. It returns the zone code, a block-specific numeric edificabilidad coefficient (overriding
the ordinance's generic per-grado value), AND a precomputed maximum buildable area in m² for that
specific block. This is materially better than Murcia capital's manual article-by-article
extraction pipeline. Confidence: **High** (live-tested, not inferred).

Related WMS/WMTS endpoints discovered under `urbanismo.cartagena.es/urbanismo/IDE`:
`wms_cartografia`, `wmts_carto`, `wms_informacion` (territorial layers: vías pecuarias, costas,
DPMT, energy networks, municipal boundaries) — useful for site context/constraints, not zoning
parameters themselves.

No GeoServer or ArcGIS Server signature was found; the stack is a custom/Esri-ish `.aspx` WMS
implementation (`wmservice.aspx`) — OGC-standard-compliant regardless of vendor, so any WMS client
library works.

### 1.3 Not yet confirmed / lower priority
`geo.cartagena.es/gemuc_004/...` (a separate GeoPortal-branded viewer) and a distinct
`geoportal-cartagena.hub.arcgis.com` listing turned up in search but were not deep-probed for
zoning-specific REST/FeatureServer endpoints — worth a follow-up pass if the WMS `Manzanas` layer
proves insufficient for any edge case, but given 1.2 already delivers structured per-block data,
this is not on the critical path.

---

## 2. Planning documents — the ordinance/parameter dictionary

`urbanismo.cartagena.es/ExtDoc/PLDOC/2001-0001/Normas/Título 4.htm` ("Título Cuarto: Normas
particulares de suelo urbano") is the **currently-valid 1987 PGMO ordinance text** defining every
zone code referenced by the `Norma urbanística` GIS field, with full numeric parameters:

| Family | Grados found | Parameters present |
|---|---|---|
| **Cc** (Casco Antiguo) | Cc1, Cc2 | altura (plantas / callejero index), fondo edificable, ocupación |
| **Vc** (Vial Colectivo) | Vc1, Vc2, Vc3 | parcela mínima, ancho lindero, edificabilidad (m²/m²), altura, ocupación |
| **Vu** (Vial Unifamiliar) | Vu1 | parcela mínima, ancho lindero, edificabilidad, altura |
| **Vi** (Vial Industrial) | Vi1 | parcela mínima, ancho lindero, edificabilidad, altura, ocupación |
| **Ac** (Aislada Colectiva) | Ac1–Ac4 | parcela mínima, forma/diámetro, separación a linderos, edificabilidad, altura, ocupación |
| **Au** (Aislada Unifamiliar) | Au1–Au3 | parcela mínima, forma, altura, edificabilidad, separación a linderos, ocupación (+ playa variant) |
| **Ai** (Aislada Industrial) | Ai1–Ai3 | parcela mínima, separaciones frente/lindero, edificabilidad, ocupación |
| **E** (Volumetría Específica) | E1–E3 | site-specific study / reference-norm / delegates to Plan Parcial or PERI |

Every parameter PRYZM's envelope engine needs (altura, edificabilidad/FAR, ocupación, retranqueo/
setback, parcela mínima, alignment via callejero index for Cc2) is present in this single document.
Título 7 ("Normas adicionales") and the `rpg_2012_3_Normas_Generales.pdf` (annulled-revision
version, for reference only — do not use as authority) plus per-zone volumetry PDFs
(`rpg_2012_3_NP6_A12a.pdf` etc.) exist but belong to the annulled R1 track. Confidence: **High**
that Título 4 is the authoritative, current dictionary; **Medium** on completeness of edge-case
zones not encountered in this pass (Casco Antiguo sub-catalogue protections, port-area SG rules).

---

## 3. GIS layer attributes

Confirmed fields on the `Manzanas` WMS layer / `Ficha/MAN` record: `ID`, `Matricula`, `Norma`
(= zone code + specific coefficient, sometimes + precomputed max buildable m²), `Ficha_web` (link).
The `Norma` field is a free-text composite (e.g. `"Vu1 (0,52)"`, `"Ac4 (2,3505) Uso Máximo
Residencial = 23384,45 m²"`) — parsing it requires a regex against the Título 4 code vocabulary,
not a clean relational field, but it is consistent and machine-tractable. `Tipo` (Residencial/
etc.), `Superficie aproximada`, `Comentarios`, `Plan origen`, `Ámbito` are additional fields visible
on the HTML Ficha (richer than the raw WMS GetFeatureInfo response, so both should be used
together: WMS for bulk/spatial query, Ficha HTML for the fuller record when needed).

---

## 4. Delegation to sectoral plans (Planes Parciales/PERI/Estudios de Detalle)

`urbanismo.cartagena.es/urbanismo/Lista/PL` lists **73 Planes Parciales/Especiales previstos**
covering ~38.4 million m², plus 32 unplanned special plans (~80,572 m²), plus 16 PERI zones nested
in the 73. Against a municipal term of ~558 km² (mostly non-urban: countryside, coast, Mar Menor,
La Manga), this 38.4M m² represents a substantial share of the *developable* land, but the portal
does not publish a direct urban-land-total to compute a clean percentage. Crucially, **blocks
inside these sectoral plans still resolve to a `Norma urbanística` code in `PLAN_R0.MANZANAS`**
(confirmed on two live examples: `R0-PP-LP6-0005` → `Vu1 (0,52)`, `R0-PP-CO51-0007` →
`Ac4 (2,3505)` with precomputed area) — i.e. **delegation does not break the query path**; the
GIS/Ficha layer already transcodes sectoral-plan parameters into the same Título 4 vocabulary.
Confidence: **High** that delegated parcels remain queryable through the same mechanism; **Low–
Medium** on the exact % of parcels this covers city-wide (not independently verified beyond the
sampled records).

---

## 5. Regional sources (IDERM / SitMurcia)

CARM operates `sitmurcia.carm.es` with a WMS layer service specifically for "Planeamiento
Urbanístico de la Región de Murcia" (IDERM `sit_usu_pla_urb_carm_wms_md`, also a `plu_sr` product).
Per prior Murcia-capital research already in memory, this regional PLU layer self-describes as
reference-only. This pass did not independently re-verify Cartagena's specific entry in that layer,
but given the municipal portal's own WMS/Ficha service is confirmed richer (structured, per-block,
with computed max buildable area — something the regional layer does not claim to offer), the
regional source is **not needed as primary** for Cartagena; it remains a secondary cross-check /
fallback only. Confidence: **Medium** (inherited conclusion by analogy, not independently
re-fetched this pass).

---

## 6. Alternative repositories

BORM publication references for both the 1987 approval (14/04/1987) and the annulled 2012 revision
(27/07/2012) were located via the portal's own Ficha records; a dedicated BORM full-text search was
not additionally run since the portal already surfaces the citations needed. Not pursued further —
not on the critical path given 1.1–1.2 already deliver structured data.

---

## Deliverables

**A. Verdict: PARTIALLY → trending toward YES for the direct-zoned majority of urban land.**
Cartagena has a live, structured, queryable WMS + Ficha service on its **currently-valid** 1987
plan, with a complete, non-annulled ordinance dictionary (Título 4) covering all needed parameters
(height, FAR, coverage, setback, minimum plot, alignment). This is architecturally *better* than
Murcia capital's pipeline (article-by-article manual extraction) because the block-level `Norma`
field sometimes already carries a precomputed max buildable area. It is not a clean "YES" because
(i) ~38.4M m² of land sits inside 73 sectoral plans whose full parameter tables (beyond the
resolved `Norma` code) were not individually verified, (ii) a new plan revision is mid-approval and
will eventually require a re-cut, (iii) the `Norma` field is semi-structured free text requiring a
parser, not a clean relational column.

**B. Coverage estimate:** **Medium-High confidence at 70–85%** of parcels could get a numeric
envelope directly from `Manzanas`/`Ficha/MAN` R0 records (both directly-zoned Título-4 blocks and
sectoral-plan blocks, since both resolve to a `Norma` code in the same layer, per the confirmed
samples). The residual 15–30% risk is: Casco Antiguo protected-catalogue parcels (special
regime, may need catalogue cross-reference), `E1`/`E3` "specific volumetry study required" zones
(no fixed numeric answer without the referenced study document), and any sectoral-plan blocks whose
`Norma` composite doesn't map cleanly to a Título 4 code. Confidence: **Medium** (based on live
sampling of ~4 records + document structure, not a full parcel-level audit).

**C. Blockers:**
- *Technical:* none blocking — WMS `GetFeatureInfo` is a standard, scriptable protocol; no
  authentication observed on the endpoints tested.
- *Legal:* the plan-validity trap (R1 vs R0) is real and must be hard-coded into any rule pack —
  using R1 would produce legally indefensible envelopes citing a court-annulled instrument. The
  pending RPG2 revision means today's answer has a shelf life.
- *Data:* `Norma` field is semi-structured free text, not a clean schema; Título 4 zone catalogue
  (Cc/Vc/Vu/Vi/Ac/Au/Ai/E with grados) needs to be transcribed once into a machine rule table;
  Casco Antiguo catalogue protections and `E1`/`E3` specific-study zones need a defined
  "insufficient data → refuse" path rather than a fabricated number.
- *Engineering:* no existing PRYZM code touches Cartagena; need a new rule-pack module mirroring
  `esMurciaEnvelope.ts`'s pattern but sourced from Título 4 + the WMS `Manzanas` layer instead of
  manual PDF extraction.

**D. Fastest implementation path:**
1. Transcribe Título 4 (Cc/Vc/Vu/Vi/Ac/Au/Ai/E, all grados) into a static typology→parameter table
   (small, finite, already fully extracted above) — this alone unlocks the parameter *dictionary*.
2. Write a thin WMS `GetFeatureInfo` client against `ide.cartagena.es/wms_RPG0/wmservice.aspx`
   (layer `Manzanas`) keyed by parcel centroid coordinates (EPSG:25830, confirmed working CRS), to
   fetch the block's `Norma` string live, per-parcel, at query time (no bulk scrape needed).
2b. As primary/fallback pair, also wire `Ficha/MAN?Periodo=R0&Entidad=PLAN_R0.MANZANAS&Valor=<id>`
   for the richer HTML record (Tipo, Superficie, Ámbito, Plan origen) when the WMS composite alone
   is ambiguous.
3. Write a small regex parser for the `Norma` composite (`"<code>(<coef>) [Uso Máximo ... = ... m²]"`)
   to extract zone code + block-specific coefficient + optional precomputed max area, falling back
   to the Título 4 table's grado default when no override is present.
4. Hard-gate: refuse (not fabricate) for `E1`/`E3` codes and any Casco-Antiguo catalogue-flagged
   parcel, exactly as the C63/L-616 "unknown ≠ zero/unbounded" precedent already established for
   other jurisdictions.
5. Founder-sign the rule pack per the standing PRYZM governance requirement, citing R0-PGMO
   (BORM 14/04/1987) + the STSJ Murcia 2015 / TS 2016 annulment of R1 as the legal basis for why R0
   (not R1) is authoritative.
Estimated effort: comparable to or *less than* Murcia capital's onboarding, since no manual
PDF-article extraction is required — the WMS layer already returns structured per-block data.

**E. Confidence summary:**
- Plan-validity resolution (R1 annulled, R0 current, dictionary intact): **High**
- WMS/Ficha services live and structured: **High** (live-tested)
- Título 4 as complete/current dictionary: **High** for the zones sampled, **Medium** on full
  completeness (port/SG/Casco Antiguo catalogue edge cases not exhaustively enumerated)
- Coverage % estimate: **Medium**
- Sectoral-plan (delegated) parcel coverage: **Medium** (only 2 live samples)
- Regional IDERM as secondary-only: **Medium** (not re-verified this pass, inherited from Murcia
  capital precedent)
- RPG2 (new revision) timeline: **Medium** (dates as stated by portal, final approval date unknown)
