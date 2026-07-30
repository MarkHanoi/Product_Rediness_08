# Madrid (INE 28079) — LEGISLATION extraction template (founder-fill)

> **What this is.** The per-zone table the founder fills with the numeric building rules for Madrid,
> transcribed from the **PGOUM Madrid *Compendio* (Normas Urbanísticas del Plan General de 1997)**.
> Madrid is the **chosen lead city for the C63 LEGISLATION axis (25 % weight)** of the ES rollout
> (`../../RATE-IMPLEMENTATION-PLAN.md` Phase C). This template is the *worksheet*; when the values are
> filled and L-449-signed they wire into the ES rule pack **mirroring the Barcelona pack shape** (see
> §How this wires, below).
>
> **THE RULE: article-cited, or it does not ship.** Every value below must carry its governing
> **Article** (Cap. 8.x) and the **document** it was read from. A field with no citable primary-source
> article stays **`TODO`** and refuses — never a guess, never a blog/slide/APR-plan figure (those are
> SECONDARY and never become a pack value, `sources/SOURCES.md` §C). `null` ≠ `0`: an absent setback
> is `null` (the containment check skips it), not `0` (which asserts "the ordinance requires zero").
> This is the same L-449 gate Barcelona passed clau-by-clau and Zürich passed for its BZO table.

---

## Source (fill from these — the two official Compendio links)

| # | Source | URL | Note |
|---|---|---|---|
| 1 | **madrid.es — Compendio de las Normas Urbanísticas del PGOUM-97** (living consolidated text) | `https://www.madrid.es/UnidadesDescentralizadas/UDCUrbanismo/PGOUM/CompendioNNUU/` → the **`Compendio 2024/`** edition PDF (the 2023 analogue read this repo used was `.../Compendio 2023/1 Compendio 2023.pdf`, `sources/SOURCES.md` §C) | ⚠ Confirm the exact **2024** deep-link/filename at fill time. The Compendio is the CONSOLIDATED NNUU updated **2024-10-24**. |
| 2 | **sede.madrid.es — sede electrónica, PGOUM normativa (Compendio)** | `https://sede.madrid.es/` → Urbanismo / PGOUM 1997 / Normas Urbanísticas (Compendio) | ⚠ Confirm the exact sede path at fill time. Second official mirror of the same consolidated text — cite whichever PDF you actually read (per **L-438**: a citation is only citable from the document you opened, never from portal prose). |

**Base plan of record:** PGOUM-97 (Plan General de Ordenación Urbana de Madrid, **BOE 19-04-1997**),
**Normas Urbanísticas**, **Título 8 — Normas de la edificación en las distintas zonas (Normas Zonales)**.
The numeric building rules live in **Capítulos 8.1 – 8.9**, one chapter per Norma Zonal (the confirmed
`Cap. 8.<n>` = `NZ <n>` pattern — see §Confirmed structure). Every Norma Zonal is **grado-structured**:
key every value on `NZ<n>.<grado>`, never a bare NZ scalar (`sources/SOURCES.md` §C).

---

## How to fill this (one pass)

1. Open a Norma Zonal's chapter in the Compendio (e.g. NZ 4 → Cap. 8.4).
2. For each **grado** of that NZ, read the numeric building conditions and transcribe into the zone's
   table below: **Value + Unit + the exact Article** (e.g. `Art. 8.4.10`) + a one-line **Note**.
3. Leave anything the chapter does not state as **`TODO`** (absent) — do not interpolate across grados.
4. When a whole NZ's grados are filled, it is ready for the **L-449 sign-off** (`sources/VERIFICATION.md`)
   and then the rule-pack wiring (§How this wires).

**Column legend (identical for every zone table):**
`Parameter` (the pack field) · `Value` · `Unit` · `Zone/Ordenanza` (the `NZ<n>.<grado>`) ·
`Source` (=PGOUM Compendio) · `Article` (Cap. 8.x — REQUIRED) · `Notes`.

Parameters mirror the Barcelona/`JurisdictionZoningContract` field set (`@pryzm/schemas`):
`plotRatioFAR` (edificabilidad, m²/m²) · `maxHeight_m` (altura de cornisa, m) · `maxFloors` (nº plantas máx) ·
`maxCoverage` (ocupación máxima, 0..1) · `setbacks.front_m` / `.rear_m` / `.side_m` (retranqueos, m) ·
`fondo edificable` (buildable depth, m — alignment zones) · `geometricRule.kind` (ADR-0270 union) ·
`permittedUse`.

---

## Confirmed PGOUM Norma-Zonal structure (from the dossier — cite, do NOT invent values)

The zone identities/chapters below are what the Madrid dossier has already established
(`sources/SOURCES.md`, `LEGISLATION-RATE.md`, `findings/L-608-MADRID-PACK-SPEC.md`). Zone **names** or
**chapters** marked `TODO` are NOT yet confirmed in-repo — confirm from the Compendio at fill, do not
guess. Every **Value** is left blank/`TODO` by design.

| Norma Zonal | Name | Cap. | `geometricRule.kind` (ADR-0270) | Confidence of the *structure* (not the values) |
|---|---|---|---|---|
| **NZ 1** | Protección del Patrimonio Histórico | 8.1 | `explicit-area` (footprint `Fondo de la Edificación` + `COEF_Z` PUBLISHED as geometry) | CONFIRMED (declared in `rulepacks/esMadridNZ1.ts`; live 2026-07-23) |
| **NZ 2** | `TODO` — confirm name (heritage / colonias históricas per `LEGISLATION-RATE.md`) | 8.2 `TODO` | `TODO` (likely alignment/explicit-area) | PARTIAL (named only in prose) |
| **NZ 3** | Volumetría específica | 8.3 | `derived-plan` **REFUSAL** — buildable volume fixed per parcel by its ficha, not a zone parameter | CONFIRMED (refusal copy in `sources/SOURCES.md` §D) |
| **NZ 4** | Edificación en manzana cerrada | 8.4 | `alignment` — Alineaciones PUBLISHED as a layer; *fondo edificable* depth is PDF | CONFIRMED (`sources/SOURCES.md` §C) |
| **NZ 5** | Edificación abierta (bloques abiertos) | 8.5 | `setback` (retranqueos) | CONFIRMED (§C) |
| **NZ 6** | `TODO` — confirm name | 8.6 `TODO` | `TODO` | UNCONFIRMED (chapter inferred from the 8.<n>=NZ<n> pattern) |
| **NZ 7** | Edificación de baja densidad | 8.7 | `setback` | CONFIRMED (§C) |
| **NZ 8** | Edificación en vivienda unifamiliar | 8.8 | `setback` (retranqueos) | CONFIRMED (§C) |
| **NZ 9** | `TODO` — confirm name (actividades económicas / industrial?) | 8.9 `TODO` | `TODO` | UNCONFIRMED (chapter inferred from the pattern) |

> ⚠ **Grados.** Each NZ subdivides into grados (e.g. NZ 1 = `1.1 … 1.6`, verified in
> `rulepacks/esMadridNZ1.ts`). The numeric rules differ per grado. Add one grado-row block per grado
> when filling — the templates below seed the FIRST grado of each NZ as the pattern; duplicate the
> block for `.2`, `.3`, … as the chapter defines.
> ⚠ **~35 % of residential land sits in a derived ámbito** (APR/APE/API/Plan Parcial) — the Madrid
> analogue of Barcelona's derived-planning trap. Those parcels are **not** a Norma-Zonal fill; the
> honest output is a `derived-plan` refusal, not an envelope (`LEGISLATION-RATE.md`).

---

## NZ 1 — Protección del Patrimonio Histórico (Cap. 8.1) — `explicit-area` (mostly published as geometry)

NZ 1 is the one zone whose buildable footprint (`Fondo de la Edificación`) and weighted edificabilidad
(`COEF_Z`) are **published as live geometry** on `sigma.madrid.es/.../PGOUM97/PG_CONDICIONES_EDIFICACION`
(not transcribed here — see `rulepacks/esMadridNZ1.ts`). The rows below are the residual *parametric*
fields, if the Compendio states any per grado; the footprint itself stays live-resolved.

| Parameter | Value | Unit | Zone/Ordenanza | Source | Article | Notes |
|---|---|---|---|---|---|---|
| `geometricRule.kind` | `explicit-area` | — | NZ 1.1 | PGOUM Compendio | Cap. 8.1 | Footprint + `COEF_Z` published; ring resolved live per manzana (layer 6). Already declared. |
| edificabilidad (`COEF_Z`) | *live per manzana* | (coded String) | NZ 1.1 | live plane | Cap. 8.1 | Resolved by the ring resolver, not a zone constant; parse semantics UNVERIFIED (`SOURCES.md` §A). |
| `maxHeight_m` | `TODO` | m | NZ 1.1 | PGOUM Compendio | Cap. 8.1 `TODO` | If stated per grado. |
| `maxFloors` | `TODO` | nº plantas | NZ 1.1 | PGOUM Compendio | Cap. 8.1 `TODO` | |
| `permittedUse` | `residential` (grado 1º) | — | NZ 1.1 | PGOUM Compendio | Cap. 8.1 | ⚠ Currently SECONDARY (COAM); re-cite to the Compendio before it earns better than amber. |

## NZ 4 — Edificación en manzana cerrada (Cap. 8.4) — `alignment` (Madrid's dominant residential typology)

The single highest-leverage fill (`LEGISLATION-RATE.md` §What would raise the rate). Alineaciones are
published as a layer (the official line is structured); the **fondo edificable** depth is in the PDF.

| Parameter | Value | Unit | Zone/Ordenanza | Source | Article | Notes |
|---|---|---|---|---|---|---|
| `geometricRule.kind` | `alignment` | — | NZ 4.1 | PGOUM Compendio | Cap. 8.4 | `alignTo: official-line` (Madrid publishes Alineaciones). |
| fondo edificable (`buildableDepth_m`) | `TODO` | m | NZ 4.1 | PGOUM Compendio | Cap. 8.4.x `TODO` | Grado-structured. Schema requires `.positive()` — no pack without it. |
| `maxHeight_m` (altura de cornisa) | `TODO` | m | NZ 4.1 | PGOUM Compendio | Cap. 8.4.x `TODO` | |
| `maxFloors` (nº plantas) | `TODO` | nº plantas | NZ 4.1 | PGOUM Compendio | Cap. 8.4.x `TODO` | |
| `maxCoverage` (ocupación) | `TODO` | 0..1 | NZ 4.1 | PGOUM Compendio | Cap. 8.4.x `TODO` | |
| `plotRatioFAR` (edificabilidad) | `TODO` | m²/m² | NZ 4.1 | PGOUM Compendio | Cap. 8.4.x `TODO` | If stated (else derived from fondo × plantas). |
| side treatment | `party-wall` (medianería) | — | NZ 4.1 | PGOUM Compendio | Cap. 8.4.x | |
| `permittedUse` | `TODO` | — | NZ 4.1 | PGOUM Compendio | Cap. 8.4.x `TODO` | |

## NZ 5 — Edificación abierta / bloques abiertos (Cap. 8.5) — `setback`

| Parameter | Value | Unit | Zone/Ordenanza | Source | Article | Notes |
|---|---|---|---|---|---|---|
| `geometricRule.kind` | `setback` | — | NZ 5.1 | PGOUM Compendio | Cap. 8.5 | Retranqueos to open space. |
| `setbacks.front_m` | `TODO` | m | NZ 5.1 | PGOUM Compendio | Cap. 8.5.x `TODO` | `null` if genuinely none — never `0`. |
| `setbacks.rear_m` | `TODO` | m | NZ 5.1 | PGOUM Compendio | Cap. 8.5.x `TODO` | |
| `setbacks.side_m` | `TODO` | m | NZ 5.1 | PGOUM Compendio | Cap. 8.5.x `TODO` | |
| `maxHeight_m` | `TODO` | m | NZ 5.1 | PGOUM Compendio | Cap. 8.5.x `TODO` | |
| `maxFloors` | `TODO` | nº plantas | NZ 5.1 | PGOUM Compendio | Cap. 8.5.x `TODO` | |
| `maxCoverage` | `TODO` | 0..1 | NZ 5.1 | PGOUM Compendio | Cap. 8.5.x `TODO` | |
| `plotRatioFAR` | `TODO` | m²/m² | NZ 5.1 | PGOUM Compendio | Cap. 8.5.x `TODO` | |

## NZ 7 — Edificación de baja densidad (Cap. 8.7) — `setback`

| Parameter | Value | Unit | Zone/Ordenanza | Source | Article | Notes |
|---|---|---|---|---|---|---|
| `geometricRule.kind` | `setback` | — | NZ 7.1 | PGOUM Compendio | Cap. 8.7 | |
| `setbacks.front_m` | `TODO` | m | NZ 7.1 | PGOUM Compendio | Cap. 8.7.x `TODO` | |
| `setbacks.rear_m` | `TODO` | m | NZ 7.1 | PGOUM Compendio | Cap. 8.7.x `TODO` | |
| `setbacks.side_m` | `TODO` | m | NZ 7.1 | PGOUM Compendio | Cap. 8.7.x `TODO` | |
| `maxHeight_m` | `TODO` | m | NZ 7.1 | PGOUM Compendio | Cap. 8.7.x `TODO` | |
| `maxFloors` | `TODO` | nº plantas | NZ 7.1 | PGOUM Compendio | Cap. 8.7.x `TODO` | |
| `maxCoverage` | `TODO` | 0..1 | NZ 7.1 | PGOUM Compendio | Cap. 8.7.x `TODO` | |
| `plotRatioFAR` | `TODO` | m²/m² | NZ 7.1 | PGOUM Compendio | Cap. 8.7.x `TODO` | |

## NZ 8 — Edificación en vivienda unifamiliar (Cap. 8.8) — `setback`

| Parameter | Value | Unit | Zone/Ordenanza | Source | Article | Notes |
|---|---|---|---|---|---|---|
| `geometricRule.kind` | `setback` | — | NZ 8.1 | PGOUM Compendio | Cap. 8.8 | Retranqueos (vivienda unifamiliar). |
| `setbacks.front_m` | `TODO` | m | NZ 8.1 | PGOUM Compendio | Cap. 8.8.x `TODO` | |
| `setbacks.rear_m` | `TODO` | m | NZ 8.1 | PGOUM Compendio | Cap. 8.8.x `TODO` | |
| `setbacks.side_m` | `TODO` | m | NZ 8.1 | PGOUM Compendio | Cap. 8.8.x `TODO` | |
| `maxHeight_m` | `TODO` | m | NZ 8.1 | PGOUM Compendio | Cap. 8.8.x `TODO` | |
| `maxFloors` | `TODO` | nº plantas | NZ 8.1 | PGOUM Compendio | Cap. 8.8.x `TODO` | |
| `maxCoverage` | `TODO` | 0..1 | NZ 8.1 | PGOUM Compendio | Cap. 8.8.x `TODO` | |
| `plotRatioFAR` | `TODO` | m²/m² | NZ 8.1 | PGOUM Compendio | Cap. 8.8.x `TODO` | |

## NZ 2 / NZ 6 / NZ 9 — structure UNCONFIRMED (fill only after confirming name + chapter)

Seed one table each ONLY after confirming the zone name, chapter, and `geometricRule.kind` from the
Compendio (do not assume the 8.<n>=NZ<n> chapter or the kind). Copy the parameter row-set from the
nearest matching zone above once the kind is known (`setback` / `alignment` / `explicit-area`).

## NZ 3 — Volumetría específica (Cap. 8.3) — `derived-plan` REFUSAL (no parametric fill)

NZ 3 has **no zone-level parametric rule** — the buildable volume is fixed per parcel by its ficha /
approved volumetry. It does NOT get a value table; its honest output is a **cited `derived-plan`
refusal** (a positive answer). The refusal copy is already authored in `sources/SOURCES.md` §D — wire
that, do not transcribe numbers.

---

## How the filled values wire into the ES rule pack (mirror Barcelona — DOCS-ONLY TODO, no code here)

⚠ **This template writes NO code.** The pointers below are the wiring plan for when values are filled +
L-449-signed. The pack shape to copy is Barcelona's
`packages/site-parcel-data/src/rulepacks/esBarcelonaEnsanche.ts` (a `JurisdictionZoningContract` parsed
at load, one zone per code, every value cited via `ordinanceRef` + `fieldProvenance`).

**Where a `madrid` legislation entry registers** — `packages/site-parcel-data/src/rulepacks/registry.ts`.
A Madrid `JurisdictionRegistration` **already exists** there (`MADRID_JURISDICTION_ID`, extent =
`MADRID_BBOX` / `isInMadrid`), but is deliberately a **REFUSAL jurisdiction**: `packsByZone` is EMPTY and
`noRulePackRefusal` returns `madridNZ1Refusal` for every code. Filling a Norma Zonal turns one refusal
into a pack:

1. **Author the pack file** per NZ (mirroring `esBarcelonaEnsanche.ts`), e.g.
   `rulepacks/esMadridManzanaCerrada.ts` (NZ 4, `alignment`), `esMadridUnifamiliar.ts` (NZ 8, `setback`),
   … — each parses `JurisdictionZoningContractSchema`, carries a `MADRID_<NZ>_ORDINANCE_REF` citing the
   Cap. 8.x article, and sets every field from THIS template (nulls stay null).
2. **Register it** — import `[ES_MADRID_<NZ>_PACK, MADRID_<NZ>_ZONE_CODES]` into the Madrid
   registration's `packsByZone` (via `packMap(...)`), keyed on the **verified** `NZ<n>.<grado>` codes.
3. **Narrow the refusal** — the Madrid registration currently blanket-refuses; once packs exist, narrow
   `noRulePackRefusal` to the still-unpacked NZ codes (keep it for NZ 3 `derived-plan` + derived-ámbito).
4. **NZ 1 is a separate track** — `rulepacks/esMadridNZ1.ts` already declares the `explicit-area` pack;
   it registers only after (a) the engine grows a `solveExplicitArea` branch, (b) the `resolveMadridNZ1Ring`
   resolver exists, and (c) `MADRID_NZ1_CERTIFIED` is L-449-signed (see that file's WIRING-TODO header).
5. **Gate on L-449** — no NZ value serves at `confidence: 'structured'` (or flips a `*_CERTIFIED` flag)
   until `sources/VERIFICATION.md` carries the human sign-off for that field (ADR-0269 curate-then-serve).

**Reusable machinery already built** (do not reinvent, `../../RATE-IMPLEMENTATION-PLAN.md` §Phase C):
the `dissolveParcelsToBlockRing` + street-width from Barcelona (block-ring is **2/4 in Madrid** —
weaker than Barcelona's 2/2, `../../SPAIN-CADASTRAL-DISSOLVE-PROBE.md`; fix the dissolve before rule
work leans on it), the `explicit-area` ringRef resolver design for NZ 1, and the Córdoba
ordinance-extraction (OCR) pipeline for the Compendio PDF where a manual read is impractical.

---

## What the founder must fill to close Madrid's LEGISLATION axis (the ask, in one list)

Per **grado** of each parametric Norma Zonal (**NZ 4, 5, 7, 8** first — NZ 4 is the dominant residential
typology and the highest-leverage), transcribe from the Compendio 2024 **with the Cap. 8.x article**:

- **`plotRatioFAR`** — edificabilidad (m²/m²)
- **`maxHeight_m`** — altura de cornisa (m)
- **`maxFloors`** — nº plantas máximo
- **`maxCoverage`** — ocupación máxima (0..1)
- **`setbacks.front_m` / `.rear_m` / `.side_m`** — retranqueos (m) — `null` if none, never `0` (NZ 5/7/8)
- **fondo edificable (`buildableDepth_m`)** — buildable depth (m) — for the `alignment` NZ 4
- **`permittedUse`** — re-cite NZ 1's use to the Compendio (currently SECONDARY/COAM)
- confirm **NZ 2 / 6 / 9** name + chapter + `geometricRule.kind` before seeding them

Then sign `sources/VERIFICATION.md` per field and wire per §How this wires. Until then Madrid keeps its
honest cited refusals; the LEGISLATION axis stays **human-gated (~65 %)** — the numbers are the gate,
not the classification (`LEGISLATION-RATE.md` — Madrid's data-readiness ~68 %, engine/shippable ceiling
~60–62 %; do NOT present those as the filled-axis score).

---

*Authority: C63 §3/§4 (LEGISLATION axis, 25 % weight) · ADR-0269 (curate-then-serve) · ADR-0270
(setback/alignment/explicit-area rule union) · ADR-0271 (Barcelona block-derived depth, the shape to
mirror) · L-449 (human-verification gate) · L-438 (cite from the response you read, not portal prose).
Feeds: `es-md/28079-madrid/LEGISLATION-RATE.md` (Axis 2) → `../../RATE-IMPLEMENTATION-PLAN.md` Phase C.
Companion sources: `sources/SOURCES.md` (per-field rows) · `sources/VERIFICATION.md` (the L-449 sign-off).
Created 2026-07-30 (Madrid = lead legislation city). Maintainer: UNASSIGNED — founder-fill.*
