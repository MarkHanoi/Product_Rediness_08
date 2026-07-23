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

**NZ 1 PROVIDER-READY (wiring + sign-off left); NZ 4/8/5/7 document-gated; no pack registered yet.**
(See `findings/L-608-MADRID-PACK-SPEC.md`, `findings/L-608-NZ1-PROVIDER-SHIPPED.md`.)

- **NZ 1** — numbers are LIVE DATA (`COEF_Z` + layer-6 footprint) and NZ 1 is now **fully
  engineered**: the merged `explicit-area` solver + the Madrid adapter
  (`esMadridNZ1Provider.ts` — `parseCoefZ`/`mapMadridConditionsToExplicitAreaSource`/
  `MadridNZ1RingProvider`, fixture-tested). The declaration pack (`esMadridNZ1.ts`) is still
  **UNREGISTERED**. Remaining is **wiring + sign-off, not research**: a server same-origin proxy,
  the `ComputeBuildableEnvelopeInput.explicitAreaFootprint` interface-field fix (a pre-existing tsc
  defect, engine owner), the NZ-code re-verify (`PG_ORDENACION` still down), and the L-449 gate.
  Live re-probe 2026-07-23 RESOLVED the ring-layer (it is **layer 6**) and the `COEF_Z` coding
  (`"-"`/`"4"`/`"5"`/`"0 / 5"` — a CODED string, defensively parsed, FAR semantics unverified).
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
- `findings/L-608-EXPLICIT-AREA-SOLVER-SHIPPED.md` — the merged jurisdiction-agnostic solver.
- `findings/L-608-NZ1-PROVIDER-SHIPPED.md` — the Madrid adapter + the live re-probe that resolved
  the ring-layer and `COEF_Z` coding + the discovered `explicitAreaFootprint` interface defect.
- `sources/SOURCES.md` — per-field citations (the trust gate). Currently: NZ 1 live-data rows
  VERIFIED-LIVE; all NZ 4/8/5/7 rule values UNVERIFIED.
- `sources/VERIFICATION.md` — the human sign-off (DRAFT — nothing signed).
