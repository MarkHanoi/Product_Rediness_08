# Clau `14b` — Remodelacio fisica — subzona b

> **STATUS: EMPTY SCAFFOLD — no values captured yet.**
> Family: **zona** · Municipality: Barcelona (`08019`) · Instrument: **PGM-1976** (Pla General
> Metropolita, aprovat 14-07-1976), Normes Urbanistiques, Titol IV, as consolidated in RPUC /
> AMB NUMAMB.
> ⚠ The designation above is a SCAFFOLD LABEL and must be replaced with the verbatim official
> designation from the ordinance. Do not treat it as sourced.

## 0 — Capture gate (read before writing anything here)

1. **Every value is cited or absent.** Article + paragraph + effective date, or the field stays
   `null`. A number without a citation does not enter this file.
2. **`null` means UNKNOWN. It never means 0, and it never means "no limit".**
   Record *no limit set by the ordinance* explicitly as `no-limit` — that is a finding, not a gap.
3. **Verbatim first.** Paste the governing sentence in `quote` before normalising it. The
   normalised number is a derivation of the quote, not a replacement for it.
4. **Scalar vs CONSTRUCTED.** If the parameter is produced by an algorithm rather than stated as a
   figure — as clau 13a's *edificabilitat* is (PGM Art. 242.2, ADR-0271) — say so in `§3` and do
   NOT flatten it to a scalar. A constructed parameter is an engineering task, not a transcription.
5. **State the rule KIND** (`setback` | `alignment` | `block-derived-alignment` |
   `tiered-occupation` | `coverage-and-far`). The wrong KIND is a wrong SHAPE, not a wrong
   number, and no confidence value corrects it.
6. **State the GRANULARITY** of every figure (parcel / block / sector / municipality). A sector FAR
   presented as a parcel FAR is a category error.

## 1 — PART A · normative parameters

One row per distinct sub-variant. Add rows rather than overwriting when an amendment supersedes.

| field | value | quote (verbatim) | legalSource | article | paragraph | effectiveDate | confidence |
|---|---|---|---|---|---|---|---|
| `officialDesignation` | | | | | | | |
| `farRatio` | | | | | | | |
| `densityScope` | | | | | | | |
| `maxHeight_m` | | | | | | | |
| `heightMeasurement` | | | | | | | |
| `maxFloors` | | | | | | | |
| `maxCoverage` | | | | | | | |
| `frontSetback` | | | | | | | |
| `rearSetback` | | | | | | | |
| `sideSetback` | | | | | | | |
| `buildableDepth` | | | | | | | |
| `permittedUse` | | | | | | | |

**Rule KIND:** *(unstated)* · **Granularity:** *(unstated)* · **GIS code (`CODI_QUAL_AJUNT`):** *(unstated)*

## 2 — Amendments that supersede the base PGM

MPGM / PMU / PERI / PEU / PMP applying to this clau. An amendment that changes a figure REPLACES the
row in §1 — record both, with dates, so the supersession is auditable.

| instrument | ambit | what it changes | approved | source |
|---|---|---|---|---|

## 3 — Is any parameter CONSTRUCTED rather than stated?

> If the ordinance describes a procedure instead of giving a figure, write the procedure here.
> This is the field that decides whether this clau is a transcription task or an engineering task.

## 4 — Open questions / unverified

> Anything that cannot yet be cited goes HERE, never in §1.

---
*Scaffold created 2026-07-31. Maintainer: UNASSIGNED. Authority: C63 · C58 · ADR-0270 (rule KIND) ·
ADR-0271 (edificabilitat is a construction). Sibling dossier: `../../RATE.md`.*
