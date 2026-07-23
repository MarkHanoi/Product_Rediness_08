# Lisboa (`pt-11 / 1106-lisboa`) — Municipality Overview

**Level:** municipality · **DICOFRE:** 1106 (approximate — VERIFY against INE register) ·
**District:** Lisboa · **ISO 3166-2:** `pt-11` · **Pack id:** `pt-1106-lisboa` ·
**Last updated:** 2026-07-23 · **Maintainer:** UNASSIGNED ·
**Status:** RESEARCH STUB — legal structure characterised; cadastral gate unresolved; no live probe; no pack

> ⚠ **DICOFRE WARNING:** The code `1106` is derived from district 11 (Lisboa), municipality 06 —
> approximate only. Verify the exact DICOFRE at `ine.pt` or `snig.dgterritorio.gov.pt` before
> using this folder name as a pipeline join key. If incorrect, rename the folder (git mv).

---

## 1 — What governs here

**Instrument chain (P1 stage):**

```
DR 15/2015 (national solo taxonomy)
  → PDM Lisboa (Plan Director Municipal)
      — In force since 30 Aug 2012, DR 2.ª série, n.º 168
      — Under ongoing revision (consult SNIT for current version)
      → PU / PP overlays where they exist
  → Possible DGPC ZEP overlays (Lisbon has many classified monuments)
  → Seismic-risk condicionante (delimited by LNEC / Civil Protection)
  → Créditos de construção (tradeable floor-area rights, Arts. 84/88/89 incentives regulation)
```

**Rule kind (P5 stage):** UNKNOWN — setback-governed vs alignment-governed has NOT been
determined for any Lisboa PDM zona. Must be resolved before any pack can be authored.

**Granularity (C58 §1.11):** parcel-level once PDM categories are sourced. PDM sets parameters
at "categoria de espaço" level. Current resolution: 0%.

---

## 2 — Pack status

| Zone / Categoria | Status | Governing article | Confidence |
|---|---|---|---|
| Espaços centrais e residenciais consolidados | NOT STARTED — category name sourced; no numeric values | PDM Art. [unknown] | — |
| All other categorias | NOT STARTED | — | — |

**No pack exists. No rule values are verified.**

---

## 3 — Open questions (Lisbon-specific)

| Question | Priority | Gate |
|---|---|---|
| **Cadastral regime (CGPR / SiNErGIC / no-cadastre)?** | **P0 — gates everything else** | Confirm via DGT/SNIC before ANY other work |
| Créditos de construção — current operative status under PDM revision? | HIGH — a Lisbon-unique mechanism that raises achievable FAR | Read PDM Arts. 84/88/89 incentives regulation |
| Altura da edificação vs cércea — which term/definition does the current PDM use? | HIGH — affects height rule definition | Read PDM glossary article |
| Seismic-risk overlay — spatial extent (GIS layer or text description)? | MEDIUM | Check PDM condicionantes cartography |
| DGPC ZEP for Lisbon's classified monuments — spatial extent? | MEDIUM | Live query DGPC Atlas geoportal |
| Full category list + índice / altura / afastamentos per categoria? | HIGH (after cadastral gate) | Read PDM regulamento from SNIT |

---

## 4 — Files in this folder

```
1106-lisboa/
├── README.md           ← this file
├── NEXT.md             ← blockers + resume steps
└── sources/
    ├── SOURCES.md      ← per-field citations (empty — no values verified)
    └── VERIFICATION.md ← human sign-off (open)
```

---

## 5 — Source data leads (not yet probed)

| Source | Provides | Endpoint | Status |
|---|---|---|---|
| SNIT — Lisboa PDM zone layer | Zone polygons + PDF regulation link | `snit-mais.dgterritorio.gov.pt` | NOT PROBED |
| PDM Lisboa regulamento | Numeric índice, altura, afastamentos per categoria | PDF from SNIT | NOT READ |
| DGT/SNIC — cadastral coverage | Parcel geometry + NIC for Lisbon parcels (if covered) | `snig.dgterritorio.gov.pt` | NOT PROBED |
| DGPC Atlas | ZGP / ZEP / ZNA for Lisbon's monuments | `patrimoniocultural.gov.pt` | NOT PROBED |
| CML — créditos de construção | Tradeable floor-area mechanism | PDM incentives regulation (Art. 84/88/89) | NOT READ |
| CML — 3D model (LOD2/3) | Buildings, sidewalks, roads | `geodados-cml.hub.arcgis.com` | LICENCE UNVERIFIED |
