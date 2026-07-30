# Braga (`pt-03 / 0303-braga`) — Municipality Overview

> **Dossier note (C63 naming, L-649/L-650).** This dossier's master scorecard face is now
> [`RATE.md`](./RATE.md) — the 7-axis composite completion rate (**research-only / NOT bake-covered** →
> all axes `not-assessed`, no scorecard computed). The legislation/data-fill rate was renamed
> `RATE.md` → [`LEGISLATION-RATE.md`](./LEGISLATION-RATE.md) and now FEEDS it as Axis 2 (see
> [`NAMING-CONVENTION`](../../../_TEMPLATE/NAMING-CONVENTION.md)).

**Level:** municipality · **DICOFRE:** 0303 (approximate — VERIFY: Distrito de Braga (03), third
municipality within district) · **District:** Braga · **ISO 3166-2:** `pt-03` ·
**Pack id:** `pt-0303-braga` · **Last updated:** 2026-07-23 · **Maintainer:** UNASSIGNED ·
**Status:** RESEARCH STUB — most tractable first target; partial numeric values cited; cadastral gate unresolved; no pack

> ⚠ **DICOFRE WARNING:** `0303` is approximate. Braga municipality within Distrito de Braga may
> not be municipality #03 within the district. Verify against INE register before pipeline use.

---

## 1 — What governs here

**Instrument chain (P1 stage):**

```
DR 15/2015 (national solo taxonomy)
  → PDM Braga (Plano Diretor Municipal de Braga)
      — In force; SNIT-listed
      → PU / PP overlays where they exist
```

**No unique overlay mechanisms identified** in this research pass — no créditos de construção,
no moda da cércea, no UNESCO ZEP. This is why Braga is the recommended **first target**.

**Rule kind (P5 stage):** UNKNOWN — likely setback-governed for residential categories. Must
confirm per PDM text before declaring.

**Granularity (C58 §1.11):** parcel-level. Current resolution: 0% (no pack).

---

## 2 — Pack status

| Zone / Categoria | Status | Values sourced | Confidence | Governing article |
|---|---|---|---|---|
| **Espaços residenciais** | PARTIALLY RESEARCHED — values cited but not primary-sourced | índice de utilização máx 1.20 (0.80 above cota de soleira); cércea máx 7.5 m | `CONVERGENT-SECONDARY` — upgrade needed | Art. [unknown] of PDM regulamento |
| All other categorias | NOT STARTED | — | — | — |

> ⚠ The two values for "espaços residenciais" were cited in secondary research. The governing
> article has NOT been read directly. They MUST be upgraded to `VERIFIED-PRIMARY` (with
> governing article cited in SOURCES.md) before any pack ships `confidence: structured`.

---

## 3 — Open questions (Braga-specific)

| Question | Priority | Gate |
|---|---|---|
| **Cadastral regime (CGPR / SiNErGIC / no-cadastre)?** | **P0 — gates everything** | Confirm via DGT/SNIC; mid-size municipalities trend better but not assumed |
| Índice de utilização — what counts as "área de edificação" per Braga PDM? | HIGH | Read the Braga PDM Art. 11 or equivalent glossary |
| Governing article for índice 1.20 + cércea 7.5 m (espaços residenciais) | HIGH | Read Braga PDM regulamento from SNIT PDF link |
| Afastamentos — Braga PDM Art. 14 or equivalent | HIGH | Read PDM text |
| Full categoria list (not just "espaços residenciais") | HIGH | Read PDM; map all categorias in the Planta de Ordenamento |
| Cota de soleira — definition and measurement point? | MEDIUM | Read PDM glossary |

---

## 4 — Why Braga first

| Factor | Braga | Lisboa | Porto |
|---|---|---|---|
| Unique mechanisms requiring new engine features | None identified | Créditos de construção (new schema type) | Moda da cércea (new rule kind) |
| Numeric values already cited | Yes — 2 (CONVERGENT-SECONDARY) | 0 | 0 |
| Cadastral coverage likelihood | Plausible (mid-size muni) | Uncertain (urban core) | Uncertain (north of Tagus) |
| Estimated dev-days (after cadastral confirmed) | **8–12** | Cannot estimate | ~15–20 |

**Recommended path:** Braga → Porto → Lisboa.

---

## 5 — Files in this folder

```
0303-braga/
├── README.md           ← this file
├── NEXT.md             ← blockers + resume steps
└── sources/
    ├── SOURCES.md      ← per-field citations (2 values cited, article unknown)
    └── VERIFICATION.md ← human sign-off (open)
```

---

## 6 — Source data leads

| Source | Provides | Endpoint | Status |
|---|---|---|---|
| SNIT — Braga PDM zone layer | Zone polygons + PDF regulation link | `snit-mais.dgterritorio.gov.pt` | NOT PROBED |
| PDM Braga regulamento | Numeric índice, cércea, afastamentos per categoria; glossary definitions | PDF from SNIT | NOT READ (values cited from secondary source only) |
| DGT/SNIC — cadastral coverage | Parcel geometry + NIC for Braga parcels | `snig.dgterritorio.gov.pt` | NOT PROBED |
