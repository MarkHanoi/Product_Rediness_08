# SOURCES — Braga (`pt-0303-braga`)

**Status:** PARTIALLY RESEARCHED 2026-07-23 — two numeric values cited from secondary research;
governing article NOT confirmed; cadastral regime NOT confirmed. No values may be used in a pack
at `confidence: structured` until §A rows are upgraded to `VERIFIED-PRIMARY`.

> Trust gate (C58 §1.6): a field with no citable source stays `null`. A pack may not ship
> `confidence: structured` unless EVERY field has a row in §A with governing article + date + URL.

---

## A — CITED (CONVERGENT-SECONDARY — upgrade required)

| Field (pack key) | Value | Unit | Governing instrument (approx) | Source | URL | Confidence | Upgrade step |
|---|---|---|---|---|---|---|---|
| `maxFAR` (índice de utilização máximo) for espaços residenciais | 1.20 (overall); 0.80 above cota de soleira | ratio (m²/m²) | Braga PDM regulamento — Art. [unknown] | Secondary research citation (Portugal master study) | `snit-mais.dgterritorio.gov.pt` → Braga PDM PDF | `CONVERGENT-SECONDARY` | Read PDM regulamento; confirm article number; replace this row with `VERIFIED-PRIMARY` row |
| `maxHeight_m` (cércea máxima) for espaços residenciais | 7.5 | m | Braga PDM regulamento — Art. [unknown] | Secondary research citation | Same | `CONVERGENT-SECONDARY` | Same as above |

---

## B — UNVERIFIED / OPEN (stays `null` in the pack)

| Field | Why not verified | What would verify it |
|---|---|---|
| Cadastral regime for Braga | Not queried | Navigate DGT SNIC / SNIG; look up DICOFRE 0303 |
| Art. 14 afastamentos (front/side/rear setbacks) for espaços residenciais | Text not read | Read Braga PDM regulamento Art. 14 (or equivalent) |
| Índice de utilização — definition of "área de edificação" (what counts) | Not read | Read Braga PDM glossary article |
| Cota de soleira — definition and measurement point | Not read | Read Braga PDM glossary |
| All other categorias de espaço (full list) | Not sourced | Scan Planta de Ordenamento + regulamento; enumerate all zone categories |
| Índice / cércea / afastamentos for each category beyond "espaços residenciais" | Not sourced | Read PDM regulamento per-category table |
| Governing article number for the two cited values | Not confirmed | Read PDM directly; find the espaços residenciais table |
| SNIT WFS field structure (attributes returned for Braga parcels) | Not probed | Run SNIT WFS GetCapabilities + GetFeature probe (see `pt/NEXT.md §3.2`) |

---

> ⚠ Until the two `CONVERGENT-SECONDARY` rows above are upgraded to `VERIFIED-PRIMARY` (governing
> article confirmed from primary PDM text), NO Braga pack may ship `confidence: structured`.
> The values may be used for internal research/scoping only, clearly labelled as unverified.
