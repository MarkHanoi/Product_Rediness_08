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

## Source — 🔴 READ THIS BEFORE OPENING ANY PDF (verified 2026-07-31)

**Two Madrid portals serve DIFFERENT consolidations of the same ordinance, simultaneously, with no
on-page warning.** Opening the wrong one silently stamps the whole extraction with a superseded
version. Both were probed live on 2026-07-31.

| # | Source | URL | Verdict |
|---|---|---|---|
| **1 ✅** | **Compendio 2025 de las NNUU del PGOUM-97 (actualizado a 24.09.2025)** — the CURRENT consolidation | `https://transparencia.madrid.es/UnidadesDescentralizadas/UDCUrbanismo/PGOUM/CompendioNNUU/Compendio_2025_septiembre/COMPENDIO_MPG_NNUU_24_09_2025.pdf` | **USE THIS.** HTTP 200, `application/pdf`, ~24.5 MB, `Last-Modified` 2025-10-20. Portal page also mirrored at `www.madrid.es/.../Vivienda-urbanismo-y-obras/Normativa/`. |
| **2 🔴** | `COMPENDIO_MPG_NNUU_07_07_2025.pdf` ("COMPENDIO JULIO 2025") | `https://geoportal.madrid.es/fsdescargas/IDEAM_WBGEOPORTAL/ESTATICOS_VISORES_URBANISTICOS/PG97/TEXTOS/…` | **DO NOT USE.** Live (HTTP 200, 26 318 633 B) but the **SUPERSEDED July consolidation**. This is the trap — the *visores urbanísticos* path leads here. |
| 3 🔴 | "Compendio 2023" / "Compendio 2024" | — | **Stale.** At least two consolidations behind. Never cite. |

⚠ **The founder-supplied URL** `madrid.es/.../Listado-de-Publicaciones/Compendio-2025-…` returns
**HTTP 404**. Its claim was right; the locator was not.

### 🔴 The Compendio is NOT the legal source — record TWO date fields, not one

The publisher states verbatim: *"El Compendio tiene carácter informativo"* and *"la versión oficial
de las normas … han sido publicadas en el **Boletín Oficial** correspondiente."* Therefore:

| Field | Value | Meaning |
|---|---|---|
| `readFrom` | `"Compendio 2025 (24-09-2025)"` | which consolidation you actually opened |
| `effectiveDate` | the **BOE** date of the article, or of the *modificación puntual* that set it | when the rule became law |

**These are different fields and must never be merged.** An article in force since 1997 does not
become "effective 2025" because a 2025 booklet reprinted it. The Compendio's own annex — *"una
relación actualizada de los artículos que han sido modificados o aclarados"* — is the index that
supplies the real dates. (Per **L-438**: cite from the document you opened, never from portal prose.)

**Base plan of record:** PGOUM-97 (Plan General de Ordenación Urbana de Madrid, **BOE 19-04-1997** —
*asserted, not re-verified*), **Normas Urbanísticas**, **Título VIII — Condiciones particulares de
las zonas de suelo urbano**. The numeric building rules live in **Capítulos 8.x**, one chapter per
Norma Zonal. Every Norma Zonal is **grado-structured** *except NZ 4* (a bare `"4"`): key every value
on the exact `AMB_TX_ETIQ` string, never a bare NZ scalar, and **never invent grados**
(`sources/SOURCES.md` §0.3, §C).

⚠ **The `Cap. 8.<n>` = `NZ <n>` pattern is INFERRED, not confirmed, above NZ 8.** The two
founder-supplied chapter maps disagree with each other (one includes 8.2/8.6, the other omits NZ 6),
and **neither contains NZ 9** although NZ 9 has six live GIS codes. **Read the Compendio's own Título
VIII table of contents first** and correct the table below before filling anything.

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

| Norma Zonal | Name | Cap. | **VERIFIED `AMB_TX_ETIQ` codes** (n) | `geometricRule.kind` (ADR-0270) | Structure confidence |
|---|---|---|---|---|---|
| **NZ 1** | Protección del Patrimonio Histórico | 8.1 | `1.1 1.2 1.3 1.4 1.5 1.6` (6) | `explicit-area` (footprint + `COEF_Z` PUBLISHED as geometry) | CONFIRMED (live 2026-07-23/24) |
| **NZ 2** | `TODO` — confirm name | 8.2 (asserted) | **none** ❌ | `TODO` | ⚠ chapter exists per one founder map; **absent from GIS** — see §0.3 of `sources/SOURCES.md` |
| **NZ 3** | Volumetría específica | 8.3 | `3.1 3.1.a 3.1.b 3.1.c 3.2` (5) | `derived-plan` **REFUSAL** — volume fixed per parcel by ficha | CONFIRMED (refusal copy §D) |
| **NZ 4** | Edificación en manzana cerrada | 8.4 | **`4` only — NO grados** (1) | `alignment` — Alineaciones published; *fondo* is PDF | CONFIRMED. ⚠ **Do NOT invent `4.1`/`4.2`** |
| **NZ 5** | Edificación abierta (bloques abiertos) | 8.5 | `5.1 5.2 5.3` (3) | ⚠ **UNDETERMINED** — `setback` *or* building-separation | ⚠ **KIND NOT CONFIRMED.** Test the wording (§C) before any code; may need an ADR |
| **NZ 6** | `TODO` — confirm name | 8.6 (contested) | **none** ❌ | `TODO` | ⚠ the two founder chapter maps **disagree** on whether 8.6 exists |
| **NZ 7** | Edificación de baja densidad | 8.7 | `7.1.a 7.1.b 7.2.e` (3) | `setback` (likely) | PARTIAL — may use *parcela mínima* instead of ocupación |
| **NZ 8** | Edificación en vivienda unifamiliar | 8.8 | `8.1.a 8.1.c 8.2.a 8.2.b 8.2.c 8.3.a 8.3.c 8.4 8.5 8.6` (**10**) | `setback` (retranqueos) | CONFIRMED. **10 rows required** |
| **NZ 9** | `TODO` — confirm name (actividades económicas?) | 8.9 **INFERRED** | `9.1 9.2 9.3 9.4.a 9.4.b 9.5` (6) | `TODO` | ⚠ **codes are LIVE but the zone is absent from every founder chapter map** — confirm name + chapter |
| NZ 10 / 11 | — | — | **none** ❌ | — | ⚠ entirely unexplained; every chapter map stops at 8.8 |
| | | | **Σ 34 live claus** | | |

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
typology and the highest-leverage), transcribe from the **Compendio 2025 (24-09-2025)** with the Cap. 8.x article, recording `readFrom` AND `effectiveDate` separately:

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
