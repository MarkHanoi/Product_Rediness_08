# Clau `20a` (bare, no suffix) — Zona d'ordenació en edificació aïllada

> **STATUS: CLOSED — `regime-undetermined`, exhausted on the primary text (§BARE-20A-EXHAUSTED, L-673, 2026-08-01).**
> Family: **zona** · Municipality: Barcelona (`08019`) · Instrument: **PGM-1976** (Pla General
> Metropolità, aprovat 14-07-1976), Normes Urbanístiques, Títol IV, Secció 6a, Arts. 337–343, as
> consolidated in RPUC / AMB NUMAMB, with the text *"d'aplicació exclusiva al municipi de Barcelona"*
> at printed pp. 179–183.
>
> ⚠ **THIS DOSSIER IS ABOUT BARE `20a` ONLY.** The ten suffixed subzones (`20a/5`, `20a/6`, `20a/7`,
> `20a/8`, `20a/9`, `20a/9b`, `20a/9u`, `20a/10`, `20a/11`, `20a/12`) are **fully transcribed and
> SHIPPED** in `packages/site-parcel-data/src/rulepacks/bcn20aSubzones.ts` +
> `esBarcelona20aAillada.ts`, and each resolves to a pack. **10.62 % of private buildable land.**

## 0 — The finding, in one line

**PGM Arts. 314.5 and 338.2 enumerate ten subzone *qualificacions*, every one carrying a suffix, and
there is no unsuffixed `20a` qualificació. Arts. 340, 342 and 343 key EVERY envelope parameter to
that suffix. Bare `20a` names a *zona*; the *qualificació* that carries numbers is `20a/N`.**

⇒ What is missing for a bare-`20a` parcel is **a SELECTOR, not a rule.** No further reading of the
plan can produce a zone-level figure the plan does not contain, and no rule pack may be built on a
"representative" subzone. **CLOSURE-REGISTER blocker 7 is closed on a negative result taken from the
primary text rather than from a portal sweep** — which the register itself accepted as a valid,
permanent closure.

## 1 — PART A · normative parameters

| field | value | quote (verbatim) | legalSource | article | paragraph | effectiveDate | confidence |
|---|---|---|---|---|---|---|---|
| `officialDesignation` | Zona d'ordenació en edificació aïllada | «Zona d'ordenació en edificació aïllada.» | PGM-1976 NNUU | 314 | 5 | 1976-07-14 | **STATED** |
| `ordinationType` | *edificació aïllada* — **the ONLY subzone-neutral determination** | «A totes les subzones el tipus d'ordenació aplicable és el d'edificació aïllada.» | PGM-1976 NNUU | 339 | — | 1976-07-14 | **STATED** |
| `farRatio` | *(subzone-keyed — 0,25 · 0,50 · 0,75 · 1,00 · 1,50)* | «Els índexs d'edificabilitat neta per a **cada una de les subzones** són els establerts al quadre següent» | PGM-1976 NNUU | 340 | 1 | 1976-07-14 | **NOT-THE-RULE-KIND at zone level** |
| `densityScope` | net, per parcel — but only via a subzone row | — | PGM-1976 NNUU | 340 | 1 | 1976-07-14 | **NOT-THE-RULE-KIND at zone level** |
| `maxHeight_m` | *(subzone-keyed — 7,55 · 9,15 · 12,20 · 13,65 · 15,25 · 16,70)* | Arts. 342.3/.4/.5, 343.2 | PGM-1976 NNUU | 342, 343 | 3, 4, 5 / 2 | 1976-07-14 | **NOT-THE-RULE-KIND at zone level** |
| `heightMeasurement` | per Art. 239.2 / Art. 240 (general rules) | — | PGM-1976 NNUU | 239, 240 | — | 1976-07-14 | STATED (general) |
| `maxFloors` | *(subzone-keyed — PB+1 … PB+4)* | Arts. 342.3/.4/.5, 343.2 | PGM-1976 NNUU | 342, 343 | — | 1976-07-14 | **NOT-THE-RULE-KIND at zone level** |
| `maxCoverage` | *(subzone-keyed — 10 %…40 %)* | Arts. 342.2, 343.1 | PGM-1976 NNUU | 342, 343 | 2 / 1 | 1976-07-14 | **NOT-THE-RULE-KIND at zone level** |
| `frontSetback` | *(subzone-keyed — 3…12 m)* | Art. 342.8 quadre | PGM-1976 NNUU | 342 | 8 | 1976-07-14 | **NOT-THE-RULE-KIND at zone level** |
| `rearSetback` | *(subzone-keyed — 3…10 m)* | Art. 342.8 quadre | PGM-1976 NNUU | 342 | 8 | 1976-07-14 | **NOT-THE-RULE-KIND at zone level** |
| `sideSetback` | *(subzone-keyed — 3…8 m)* | Art. 342.8 quadre | PGM-1976 NNUU | 342 | 8 | 1976-07-14 | **NOT-THE-RULE-KIND at zone level** |
| `buildableDepth` | **NOT-THE-RULE-KIND** — this is a `setback` zone, not an `alignment` one | «el tipus d'ordenació aplicable és el d'edificació aïllada» | PGM-1976 NNUU | 339 | — | 1976-07-14 | **NOT-THE-RULE-KIND** |
| `permittedUse` | *(subzone-keyed: plurifamiliar I–V / unifamiliar VI–IX)* | Art. 338.2 | PGM-1976 NNUU | 338 | 2 | 1976-07-14 | **NOT-THE-RULE-KIND at zone level** |

⚠ **Every cell marked NOT-THE-RULE-KIND is a cell where the ordinance states a value — just not for
this granularity.** It is not UNKNOWN. The figures are transcribed and shipped, per subzone, and the
ranges are published under `BCN_20A_BARE_ORDINANCE_REF`.

**Rule KIND:** `setback` (Art. 339, subzone-neutral) · **Granularity:** **SUBZONE — and that is the
finding** · **GIS code (`CODI_QUAL_AJUNT`):** `20a` (zone) / `20a/N` (qualificació) · **harmonised
`CODI_QUAL_MUC`:** `R4` (plurifamiliar) / `R6` (unifamiliar)

## 2 — Amendments that supersede the base PGM

| instrument | ambit | what it changes | approved | source |
|---|---|---|---|---|
| Modificació *d'aplicació exclusiva al municipi de Barcelona* | 08019 | Arts. 342/343 restated; Art. 342.5 gains an **edificabilitat** column keyed on *amplada de vial*; dwelling module 100 m² → **80 m²**; Art. 343.1 small-parcel regime added. ⚠ **Arts. 337, 338, 339 and 340 are NOT modified** — footnote 54 sits on Art. **341**, not on 340. | — | PGM NNUU printed pp. 179–183, 185–186; transcribed in `BCN_20A_BARCELONA_DELTAS` |

**⚠ None of these creates a bare-`20a` qualificació.** The Barcelona text keeps the same ten
suffixes, which is itself corroborating evidence for the closure.

## 3 — Is any parameter CONSTRUCTED rather than stated?

Yes, for **subzona V (`20a/8`)**: Barcelona's Art. 342.5 makes the *realisable* edificabilitat a
function of the *amplada de vial*, so it is a construction, not Art. 340.1's headline 1,50. Shipped
as such (`resolveAlcada20aSubzonaV`, `resolve20aEdificabilitat`).

For **bare `20a` nothing is constructed** — there is nothing at zone level to construct *from*.

## 4 — Open questions / unverified

1. **Does any published layer carry the subzone suffix per parcel?** Unknown, and it is the ONLY
   thing that would move this. It would supply the missing **selector**; it would not supply a rule.
   ⚠ The MUC's `CODI_QUAL_AJUNT` carries the suffix for **31 of 36** sampled 20a points and stops at
   the zone for **5**, so the gap is in the source's own completeness, not in its schema.
2. **Art. 255 slope reduction** (Barcelona) — an envelope-relevant reduction of the edificabilitat
   coefficient by parcel slope (30–50 % ⇒ −20 %; 50–100 % ⇒ −40 %; > 100 % ⇒ inedificable). ⚠ **Not
   applied on ANY 20a parcel, suffixed or not** (PRYZM extrudes from a flat plane, L-584). Recorded
   in `BCN_20A_UNMODELLED_RULES` as the single largest known over-statement source for a hillside
   20a plot — and much of Barcelona's 20a fabric IS hillside.
3. **Cossos sortints** — settled, and it does NOT cut against this zone: Art. 230.II charges a
   projection against the same occupation percentage and boundary separations the envelope is
   already drawn to, so omitting them is **EXACT** here, not merely safe. See
   `esBarcelonaCossosSortints.ts` (§COSSOS-SORTINTS, L-672).

## 5 — Measured share, and what closing this was worth

| | value | denominator |
|---|---|---|
| bare `20a` | **1.55 %** | private buildable land (AMB `qualificacio_refos` census, 31,801,618 m²) |
| bare `20a` | **1.82 %** (5 of 275 points) | the repo's independent 275-point MUC grid |
| whole `20a` family | **10.62 %** | private buildable land — **all ten subzones SHIPPED** |

**ENVELOPE-coverage delta: +0.00 pp.** A refusal is not an envelope, and the L-656 denominator
counts land that can carry a *computed* envelope. What changed is that 1.55 % of buildable land
stopped being told a **false statement about PRYZM's own coverage** and started being told the
ordinance's own answer, under a citation. That is a correctness move, not a coverage move — the
same shape as `22@`'s DEC-1 closure.

⚠ **The cited ceiling does NOT drop, unlike `22@`'s.** 22@'s omission is intentional in the law, so
its 2.06 % can never carry a computed envelope. Bare `20a`'s numbers **exist**; only the selector is
missing. A subzone-granular layer would return all 1.55 % to the computable set, so it stays inside
the ceiling.

---
*Closed 2026-08-01 (§BARE-20A-EXHAUSTED / L-673). Authority: C63 · C58 §1.11/§1.13.4/§1.13.7 ·
ADR-0270 (rule KIND) · ADR-0276 (the `regime-undetermined` code) · L-656 (the denominator).
Code: `rulepacks/bcn20aSubzones.ts` · `rulepacks/esBarcelonaZoneClassification.ts`.
Tests: `__tests__/esBarcelonaClosureBlockers.test.ts`. Sibling dossier: `../../RATE.md`.*
