# Greater London (E12000007 london, England, United Kingdom) — city dossier

**Level:** region/city (Greater London) · **id:** `gb-eng` · `E12000007` (ONS GSS region; coterminous with GLA
area `E61000001`; NOT the City of London LAU `E09000001`) · **Pack id (== folder identity):** `gb-E12000007-london`
**Last updated:** 2026-07-30 · **Maintainer:** UNASSIGNED · **Status:** SCAFFOLD

> Scorecard face = **[`RATE.md`](./RATE.md)** (composite master, C63). The bake extract is `greater-london`
> and the terrain source is EA England, so the tackled unit is **Greater London**, not the square-mile City of
> London. Bake bbox `-0.20,51.44,0.02,51.55` is a central-London slice (City · Westminster · Camden · Southwark ·
> Tower Hamlets · Islington · Hackney · Lambeth).

## 1 — What governs here

- **Governing-instrument chain:** `parcel → GLA London Plan (spatial policy) + borough Local Plan (Policies Map)
  → discretionary determination (NPPF, material considerations, design review) → Conservation Area / Listed
  Building / Article 4 overlays`.
- **Rule KIND (ADR-0270 / C58 §2.2):** **none of the codified numeric KINDs applies** — GB permission is
  discretionary, not setback/alignment/FAR by-right. ⚠ This is a wrong-SHAPE risk if forced into a numeric KIND.
- **Setback- vs alignment-governed:** neither by-right; determined case-by-case.
- **Legal-structure trap watch (P1):** the London Plan density matrix + tall-buildings + LVMF protected views are
  policy/discretion, easily mistaken for a by-right envelope — they are not.

## 2 — Pack status

| Zone / district | Kind | Disposition | Confidence | Note |
|---|---|---|---|---|
| All London | — | `unregistered` | `null` | No pack; discretionary planning |

## 3 — Granularity (C58 §1.11)

Regulation is by **planning application** at the parcel/site level, decided against borough Local Plan policy +
the London Plan. No by-right parcel-level numeric envelope exists. GSS `E12000007` is the Greater London **region**
granularity; the bake/terrain bbox is a central slice, not the full GLA outer boundary.

## 4 — The number

**0 %** of clicks return a full, cited by-right envelope (none exists — discretionary planning). The honest
product answer is a footprint + a "requires planning permission" statement, never an invented FAR/height.

## 5 — Files in this folder

`RATE.md` (composite master) · `LEGISLATION-RATE.md` · `ENVELOPE.md` · `HEIGHT.md` · `RISK-REGISTER.md` ·
`NEXT.md` · `RATE-IMPLEMENTATION-PLAN.md` · `README.md` (this) · `sources/`.

## 6 — Open questions / unverified

- EA DSM 1 m GetCoverage keyless for the London bbox? (would unlock the measured-height derive — `HEIGHT.md`).
- HMLR INSPIRE Index Polygons usable as a footprint-plus routing source?
- Which context layers (rail/trees/sea) land after the L-642 re-bake for London?
