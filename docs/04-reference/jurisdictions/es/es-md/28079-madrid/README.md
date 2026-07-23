# Madrid (INE 28079, ISO es-md) — jurisdiction record

> **What governs here · pack status · granularity · the number · file index.** Follows the
> JURISDICTION-PLAYBOOK file contract (§3.1). Last updated 2026-07-23.

## What governs here

Madrid city is governed by the **PGOUM-97** (Plan General de Ordenación Urbana de Madrid, BOE
19-04-1997), living text = **Compendio de las Normas Urbanísticas, Compendio 2023**. Residential
land splits two ways:

- **~65 % directly governed by a Norma Zonal** (the *Área de Ordenación Directa en Suelo Urbano*,
  11 Normas Zonales). This is the packable land.
- **~35 % in a derived ámbito** (APR / APE / API / Plan Parcial) — the Madrid analogue of
  Barcelona's derived-planning trap. This is a **`derived-plan` refusal**, not an envelope: the
  general plan points at a per-site document PRYZM does not hold.

**Setback-governed vs alignment-governed (ADR-0270 — the wrong SHAPE is worse than a wrong number):**
Madrid uses **all three** geometric operations, and getting the kind right per Norma Zonal is the
whole point of this record:

| Norma Zonal | Typology | geometricRule kind |
|---|---|---|
| **NZ 1** Protección del Patrimonio Histórico | historic core | **`explicit-area`** — footprint published as data |
| **NZ 3** Volumetría específica | per-parcel volume | **refusal `derived-plan`** (per-parcel ficha) |
| **NZ 4** Edificación en manzana cerrada | ensanche | **`alignment`** — alineación + fondo edificable |
| **NZ 8** (+ 5, 7) unifamiliar / abierta / baja densidad | detached/open | **`setback`** — real retranqueos |

## Pack status

**SPEC ONLY — no shippable pack, and no pack is registered.** (See `findings/L-608-MADRID-PACK-SPEC.md`.)

- **NZ 1** — numbers are LIVE DATA (`COEF_Z` + `Fondo de la Edificación`, verified this pass), but
  **engine-blocked**: `explicit-area` has no solver branch (C58 §2.2 KG-4). A declaration-grade pack
  file exists at `packages/site-parcel-data/src/rulepacks/esMadridNZ1.ts` — **UNREGISTERED**, all
  numerics null, confidence `estimated-ruleset`, human-verification gate NOT passed.
- **NZ 4 / 8 / 5 / 7** — DOCUMENT-gated. Values are grado-structured in the NNUU and were not
  sourced citeably this pass. The Zod schema (`buildableDepth_m.positive()`,
  the mandatory setback triple) **structurally forbids** a placeholder pack. Values stay `null`.
- **NZ 3** — a cited `derived-plan` refusal is authorable now (copy in `sources/SOURCES.md`).

## Granularity (C58 §1.11)

- NZ 1 `COEF_Z` — **block** (keyed on `CODMANZANA`); footprint is the per-parcel legal answer but
  derived from per-manzana geometry.
- NZ 4 / 8 fondo & retranqueos — **parcel** (once sourced).
- `Visor_Edificabilidad` service — **ámbito** only ⇒ context, never a parcel envelope.

## The number (honest, denominator named)

**Denominator = a Madrid residential parcel click.** Shippable envelope resolution **today ≈ 0 %**
(NZ 4/8 document-gated, NZ 1 engine-gated). **Ceiling** once the four NZs are sourced and NZ 1's
`explicit-area` solver ships **≈ 60–62 %** (0.65 × 0.96). The per-NZ land-share split is
**UNSOURCED** — not asserted. Derivation in `findings/L-608-MADRID-PACK-SPEC.md` §6.

## File index

- `README.md` — this file.
- `NEXT.md` — where we stopped, blockers, trip-wires, smallest next step.
- `findings/L-608-MADRID-PACK-SPEC.md` — the substantive record: probe results, rule-kind
  justifications, the `explicit-area` ringRef resolver design, resolution derivation.
- `sources/SOURCES.md` — per-field citations (the trust gate). Currently: NZ 1 live-data rows
  VERIFIED-LIVE; all NZ 4/8/5/7 rule values UNVERIFIED.
- `sources/VERIFICATION.md` — the human sign-off (DRAFT — nothing signed).
