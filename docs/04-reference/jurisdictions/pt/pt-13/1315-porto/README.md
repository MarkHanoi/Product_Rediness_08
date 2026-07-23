# Porto (`pt-13 / 1315-porto`) — Municipality Overview

**Level:** municipality · **DICOFRE:** 1315 (approximate — VERIFY against INE register) ·
**District:** Porto · **ISO 3166-2:** `pt-13` · **Pack id:** `pt-1315-porto` ·
**Last updated:** 2026-07-23 · **Maintainer:** UNASSIGNED ·
**Status:** RESEARCH STUB — legal structure characterised; cadastral gate unresolved; no live probe; no pack

> ⚠ **DICOFRE WARNING:** The code `1315` is approximate (district 13, municipality 15 within
> district). Verify against INE register (`ine.pt`) before using as a pipeline join key.

---

## 1 — What governs here

**Instrument chain (P1 stage):**

```
DR 15/2015 (national solo taxonomy)
  → PDMP — Plano Diretor Municipal do Porto
      — Aviso n.º 12773/2021, 8 July 2021; updated since; SNIT-listed
      → PU / PP overlays
  → DGPC ZEP for Porto Historic Centre (UNESCO World Heritage Site — Ribeira/Barredo area)
  → Possible Art. 11 "moda da cércea" fabric-derived height rule
```

**Rule kind (P5 stage):** UNKNOWN — likely a mix of setback-governed (standard categories) and
`fabricDerivedHeight` (moda da cércea categories). The `fabricDerivedHeight` kind does NOT yet
exist in C58 §2.2. A C58 amendment is required before any Porto pack can be authored for
moda-da-cércea zones.

**Granularity (C58 §1.11):** parcel-level. Current resolution: 0%.

---

## 2 — Pack status

| Zone / Categoria | Status | Notes |
|---|---|---|
| Art. 11 urban space categories (two types by urbanisation degree) | NOT STARTED — category structure known from PDMP Art. 11; no numeric values sourced | |
| Art. 12-family functional categories | NOT STARTED | |
| Moda da cércea zones | BLOCKED — requires new C58 `fabricDerivedHeight` rule kind | C58 amendment required before pack can be authored |

**No pack exists. No rule values are verified.**

---

## 3 — Open questions (Porto-specific)

| Question | Priority | Gate |
|---|---|---|
| **Cadastral regime (CGPR / SiNErGIC / no-cadastre)?** | **P0 — gates everything** | Confirm via DGT/SNIC before ANY other work |
| Moda da cércea — which PDMP zones use it? Governing article? Formula? | HIGH | Read PDMP Art. [X] — search for "moda da cércea" in regulamento text |
| Índice de edificação — Art. 11 definition (what counts as "área de edificação")? | HIGH | Read PDMP Art. 11 directly from Aviso 12773/2021 |
| DGPC ZEP spatial extent for Porto Historic Centre (Ribeira/Barredo) | MEDIUM | Live query DGPC Atlas for Porto UNESCO site ZEP polygon |
| Full categoria list + índice / cércea / afastamentos per categoria | HIGH (after cadastral gate) | Read PDMP regulamento from SNIT |

---

## 4 — Files in this folder

```
1315-porto/
├── README.md           ← this file
├── NEXT.md             ← blockers + resume steps
└── sources/
    ├── SOURCES.md      ← per-field citations (empty)
    └── VERIFICATION.md ← human sign-off (open)
```

---

## 5 — Source data leads (not yet probed)

| Source | Provides | Endpoint | Status |
|---|---|---|---|
| SNIT — Porto PDM zone layer | Zone polygons + PDF regulation link | `snit-mais.dgterritorio.gov.pt` | NOT PROBED |
| PDMP regulamento (Aviso 12773/2021) | Numeric índice de edificação, cércea, afastamentos per categoria; moda da cércea mechanism | PDF from SNIT / Diário da República | NOT READ |
| DGT/SNIC — cadastral coverage | Parcel geometry + NIC (if Porto covered) | `snig.dgterritorio.gov.pt` | NOT PROBED |
| DGPC Atlas | ZEP for Porto Historic Centre (UNESCO World Heritage) | `patrimoniocultural.gov.pt` | NOT PROBED |
