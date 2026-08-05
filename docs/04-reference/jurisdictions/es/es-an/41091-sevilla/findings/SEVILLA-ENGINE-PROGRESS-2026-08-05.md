# Sevilla (INE 41091) — Engine Progress, 2026-08-05

> Scope: extend `packages/site-parcel-data/src/rulepacks/esSevilla.ts` with a second, third,
> fourth and fifth transcribed zone family, following the SB precedent's rigor. Read-first per
> the brief: `SEVILLA-FEASIBILITY-REVIEW-2026-08-05.md`, `esSevilla.ts`, `resolveSevillaZone.ts`.
> Córdoba was not touched (its files show unrelated concurrent changes from parallel work this
> session — confirmed via `git status`, not caused by this pass).
>
> ⬆⬆ 2026-08-05 (second continuation) — NINE MORE ZONES transcribed, bringing coverage from 5 to
> 14 of the live 15-code universe. Only `CH` (Centro Histórico) remains unpacked. See §2b below.
>
> ⬆⬆⬆ 2026-08-05 (third continuation) — `CH` FOUND AND PACKED (no separate PEPRI needed — it was
> in the same PDF all along, see §8). **15 of 15 (100 %) of the live zona_orden universe is now
> packed.** A live end-to-end pipeline proof also SUCCEEDED this pass, see §9.

## 1. The live zone-code universe — the real completion target

Re-derived from `docs/04-reference/jurisdictions/es/es-an/41091-sevilla/findings/CAPABILITY-AUDIT-2026-08-04.md`
(a live `returnDistinctValues` query against `Info_Urban_Groups/PGOU/FeatureServer/25`,
`zona_orden`, already run and recorded that session — re-read, not re-queried, this pass since no
change was expected or found in a static PGOU layer): **15 real `zona_orden` zone-family codes**
across 13,863 `Calificación` features —

```
M · ST-C · CT · IS · AD · CH · A · IC · CJ · MP · UA · SB · IA · SA · ST-A
```

(plus `null`, a blank/whitespace value, and one anomalous `"ver PG 87"` graphic cross-reference —
not real codes, unresolved data-quality flags, not part of the completion target).

## 1b. The Título XII chapter map — the real mapping found this pass

Re-derived from `06_TR_NORMAS.pdf` itself (`pdftotext`, both `-layout` for chapter-heading
scanning and plain-mode for clean article text — `-layout` badly interleaves this PDF's two-column
pages; plain mode reads cleanly). Título XII runs Capítulos I–XII, one `Art. 12.N.x` block per
chapter, and NONE of the remaining codes' chapter numbers could be guessed from the letters —
confirmed by reading each chapter's own "ámbito" article:

| Cap. | Title | zona_orden code(s) | Arts. |
|---|---|---|---|
| I | Disposiciones generales | (n/a) | 12.1.x |
| II | Centro Histórico | `CH` | 12.2.x |
| III | Edificación en Manzana | `M`, `MP` (sub-ordenación, alineación interior) | 12.3.1–12.3.14 |
| IV | Edificación Abierta | `A` | 12.4.1–12.4.13 |
| V | Suburbana | `SB` | 12.5.1–12.5.13 |
| VI | Ciudad Jardín | `CJ` | 12.6.1–12.6.6 |
| VII | Vivienda Unifamiliar Adosada | `AD` | 12.7.1–12.7.5 |
| VIII | Vivienda Unifamiliar Aislada y/o Agrupada | `UA` | 12.8.1–12.8.7 |
| IX | Conservación Tipológica | `CT` | 12.9.1–12.9.6 |
| X | Ordenación Industrial | `IS`, `IA`, `IC` (subzones of letra "I") | 12.10.1–12.10.5 |
| XI | Servicios Avanzados | `SA` | 12.11.1–12.11.4 |
| XII | Servicios Terciarios | `ST-C`, `ST-A` (subzones of letra "ST") | 12.12.1–12.12.3 |

`MP` is NOT its own chapter — it is a sub-ordenación of `M` (Art. 12.3.1 §3: "la letra (M) o (Mp),
correspondiente esta última sigla a las manzanas en que se establece alineación interior"). `IS`/
`IA`/`IC` and `ST-C`/`ST-A` are likewise subzones of one chapter each (Art. 12.10.1 §2, Art.
12.12.1 §2), not separate chapters — confirmed from the chapters' own text, not guessed from the
letters (`IS` = Industria Singular, NOT what the letters alone would suggest; `ST-A`/`ST-C` =
edificación terciaria abierta/compacta, both PRIVATE commercial-building zones, NOT the
"Sistema General" public-infrastructure category the brief flagged as a possibility — read in
full, neither is a public/no-private-envelope category).

## 2. Four more zones transcribed the first continuation pass

All four read via `pdftotext` (native-text extraction) from the SAME consolidated
`06_TR_NORMAS.pdf`, Título XII, no new live `zona_orden` feature queried for any of them (same
honesty scope as the prior session's `CJ` — see each zone's `ordinanceRef`).

### M — Edificación en Manzana, Capítulo III, Arts. 12.3.1–12.3.14 (pp. 206–210)

A THIRD structural refusal, on SB's exact precedent — if anything a cleaner copy of it:
- `permittedUse: ['residential']`, `maxCoverage: 0.8` (Art. 12.3.6 §1.a — planta baja 80–100 % /
  resto de plantas 80 % flat, no parcel-size branch).
- `setbacks.front_m: 0` / `side_m: 0` — Art. 12.3.3, mandatory alignment + party-wall.
- `setbacks.rear_m: null` — **no article in the chapter states a rear-lindero figure at all**
  (all 14 articles read; the only depth mechanism is the occupation cap). `geometricRule:
  explicit-area` with `SEVILLA_M_FONDO_UNRESOLVED_RING`.
- `maxHeight_m`/`maxFloors`/`plotRatioFAR`: `null` — per-block plan / table (Art. 12.3.8/12.3.9).

### AD — Vivienda Unifamiliar Adosada, Capítulo VII, Arts. 12.7.1–12.7.5 (pp. 219–221)

**Sevilla's FIRST non-refused zone.** Every lindero is a flat, unconditional figure (Art. 12.7.3
§4): front 4 m, rear 4 m, side 0 m (party-wall). `geometricRule: { kind: 'setback', front_m: 4,
side_m: 0, rear_m: 4 }`. `maxCoverage: 0.6`, `plotRatioFAR: 1.2` (both flat). `maxHeight_m`/
`maxFloors`: `null` (per-parcel graphic, 7 m absolute ceiling cited not packed).

### UA — Vivienda Unifamiliar Aislada y/o Agrupada, Capítulo VIII, Arts. 12.8.1–12.8.7 (pp. 221–223)

**Sevilla's SECOND non-refused zone.** Art. 12.8.3 §4: front 6 m, "resto de linderos" 5 m, all
flat. `geometricRule: { kind: 'setback', front_m: 6, side_m: 5, rear_m: 5 }`. `maxCoverage: 0.3`,
`plotRatioFAR: 0.6` (both flat). `maxHeight_m`/`maxFloors`: `null` (9 m ceiling cited not packed).

## 2b. NINE more zones transcribed this pass (second continuation) — 3 real footprints, 6 refusals

### Real footprints — Sevilla's THIRD/FOURTH/FIFTH non-refused zones

**`IS` — Industria Singular, Cap. X, Art. 12.10.2 (pp. 225-226).** `geometricRule: { kind:
'setback', front_m: 5, side_m: 5, rear_m: 5 }` — Art. 12.10.2 §2.2, flat 5 m to ALL linderos for
new construction. `plotRatioFAR: 1.5` (§2.4, 3 m²t/2 m²s flat). `maxHeight_m: 20` (§2.5 — this
chapter EXPLICITLY states height is NOT fixed per plano for IS, unlike every prior zone; 20 m is
the article's own flat answer, not a mere ceiling — the exceptional 35 m branch is not packed).
`maxCoverage: null` (§2.3 — occupation is DERIVED from the setback, not an independent cap; packing
a computed number would be this pass's own arithmetic, not the ordinance's).

**`IA` — Industria en Edificación Abierta, Cap. X, Art. 12.10.3 (pp. 226-228).** `geometricRule: {
kind: 'setback', front_m: 6, side_m: 5, rear_m: 5 }` (§2.1, flat). `plotRatioFAR: 1.5` (§2.3, same
ratio as IS). `maxHeight_m: 15` (§2.4, flat stated ceiling, not per-plano-only — exceptional 30 m
branch not packed). `maxCoverage: null` (§2.2, same derived-from-setback reasoning as IS).

**`SA` — Servicios Avanzados, Cap. XI, Arts. 12.11.1–12.11.4 (pp. 230-231).** `geometricRule: {
kind: 'setback', front_m: 5, side_m: 4, rear_m: 4 }` (§1, flat). `plotRatioFAR: 2.0` (§4, flat).
`maxHeight_m: null` (§3 — per-plano, 25 m ceiling cited not packed). `maxCoverage: null` (§2,
derived from setback).

### Structural refusals — six zones, real cited articles, no fabricated box

**`CT` — Conservación Tipológica, Cap. IX, Arts. 12.9.1–12.9.6 (pp. 223-225).** The WEAKEST
footing of any Sevilla zone read: Art. 12.9.3 puts alineaciones, occupation, height AND
edificabilidad entirely on the Planos de Ordenación Pormenorizada Completa — no flat metres or
percentage figure exists anywhere in the chapter (M/CJ at least state one flat edge each).
`SEVILLA_CT_ORDEN_UNRESOLVED_RING`.

**`IC` — Industria en Edificación Compacta, Cap. X, Art. 12.10.4 (pp. 228-229).** Front = 0 flat
(alineación obligatoria, §2.1), but side/rear is h/2 (min 3 m) CONDITIONAL on parcels >1,000 m²
built after Plan entry into force (§2.2), with a THIRD adosado-under-Estudio-de-Detalle branch
(§2.3) — CJ's exact shape. `SEVILLA_IC_LINDEROS_UNRESOLVED_RING`.

**`ST-C` — Servicios Terciarios, Edificación Compacta, Cap. XII, Art. 12.12.2 (pp. 231-233).** NO
lindero article exists at all — buildings may occupy up to 100% of the parcel bounded only by FAR
(§2.1), and both FAR and height are plantas-count TABLES (§§2.2-2.3, L-526), never a scalar. The
clearest possible mechanism-A risk in this whole pack: 100% occupation + zero lindero rule + no
`geometricRule` would draw the entire parcel. `SEVILLA_STC_ORDEN_UNRESOLVED_RING`.

**`ST-A` — Servicios Terciarios, Edificación Abierta, Cap. XII, Art. 12.12.3 (pp. 233-234).**
Separación a linderos is a FOUR-BRACKET table keyed on parcel area (§2.3: <2,000/2,001-5,000/
5,001-7,000/>7,000 m² → 4/6/8/10 m) — here the size table IS the primary rule, with no flat
"standard regime" fallback to pack instead (unlike SB/CJ/UA's own not-packed size EXCEPTIONS).
`SEVILLA_STA_LINDEROS_UNRESOLVED_RING`.

**`A` — Edificación Abierta, Cap. IV, Arts. 12.4.1–12.4.13 (pp. 210-214).** Art. 12.4.3 §1
governs EVERY lindero — including the front (measured from the street axis) — by 40% of height
(h), with height itself per-manzana (Art. 12.4.5 §2). WEAKER footing than CJ, which at least fixed
a flat 4 m front. `maxCoverage: 0.6` IS packed (Art. 12.4.6 §1, flat standard-case figure) — the
occupation half of this zone is real even though the setback half is not.
`SEVILLA_A_LINDEROS_UNRESOLVED_RING`.

**`MP` — sub-ordenación of `M`, alineación interior, Cap. III, Arts. 12.3.4/12.3.6 §1.b/12.3.7
§1.b/12.3.9 §2.** Front shares M's flat 0 m alignment (Art. 12.3.3), but side/rear/depth is fixed
by an "alineación interior" drawn GRAPHICALLY on the Planos de Ordenación (Art. 12.3.4) — no
metres figure exists anywhere in the text for how deep that line sits. WORSE than M's own gap (M
states no rear article exists at all; Mp's depth is explicitly governed by a real figure this pack
simply cannot read off a plan it does not hold). `SEVILLA_MP_INTERIOR_UNRESOLVED_RING`.

## 3. Live zone-identity lookup — unchanged, still zone-agnostic

`resolveSevillaZone`/`applySevillaZoningThenFallback` required no code changes — adding zones to
`ES_SEVILLA_PGOU_PACK.zones` automatically makes them resolvable, exactly as when CJ was added.

## 4. Gate status

`SEVILLA_ENVELOPE_VERIFIED` remains `false`, untouched. Five of the fourteen packed zones (`AD`,
`UA`, `IS`, `IA`, `SA`) now carry a REAL, non-refused `status: 'ok'` footprint if the gate were
ever flipped. It still must not be flipped by an implementer (L-449).

## 5. Coverage tally — as of §2b (14 of 15 real live zone codes, 93 %); see §8 for the final 15/15

| Code | Chapter | Status |
|---|---|---|
| `SB` | Cap. V | Packed — structural refusal (occupation/rear-band conditional) |
| `CJ` | Cap. VI | Packed — structural refusal (h/2 height-dependent) |
| `M` | Cap. III | Packed — structural refusal (occupation-only, no rear stated) |
| `AD` | Cap. VII | Packed — real footprint, no refusal |
| `UA` | Cap. VIII | Packed — real footprint, no refusal |
| `IS` | Cap. X | **Packed — real footprint, no refusal** |
| `IA` | Cap. X | **Packed — real footprint, no refusal** |
| `SA` | Cap. XI | **Packed — real footprint, no refusal** |
| `CT` | Cap. IX | **Packed — structural refusal (fully graphic, no flat figure anywhere)** |
| `IC` | Cap. X | **Packed — structural refusal (h/2 + size-threshold conditional)** |
| `ST-C` | Cap. XII | **Packed — structural refusal (no lindero rule at all, table-only FAR/height)** |
| `ST-A` | Cap. XII | **Packed — structural refusal (parcel-size-bracketed setback table)** |
| `A` | Cap. IV | **Packed — structural refusal (40%·h on every lindero, incl. front)** |
| `MP` | Cap. III | **Packed — structural refusal (graphic interior-alignment depth)** |
| `CH` | Cap. II | **Packed — structural refusal (full-depth-by-default rear + computed-area occupation)** |

## 6. Test results

`cd packages/site-parcel-data && npx vitest run esSevillaEnvelope resolveSevillaZone`:
**2 files, 73 tests, all passing** (up from 51 — this pass added 22 new tests: 3 real-footprint
describe blocks for IS/IA/SA, plus a parametrized structural-refusal suite covering CT/IC/ST-C/
ST-A/A/MP, and updated the 2 pinned zone-list assertions from `['AD','CJ','M','SB','UA']` to the
full 14-code sorted list).

Full-repo `npx vitest run` was launched; Córdoba's own concurrent-session files
(`esCordobaPGOU2001.ts`, `esCordobaZoneClassification.ts`, their test files, plus new
`cordobaTracedZone*` files) are untouched by this pass — confirmed via `git status` before and
after. Any pre-existing Córdoba test failures are that concurrent session's own state, not caused
here.

## 7. What's still needed (superseded by §8 below for `CH`)

The shared cross-city engine gap (a per-parcel height/occupancy solver that would lift the nine
structural-refusal zones' — SB/CJ/M/CT/IC/ST-C/ST-A/A/MP/CH — refusals to real footprints) is
still open, shared with Córdoba's MC zone.

## 8. 2026-08-05 (third continuation) — Part A: `CH` FOUND AND PACKED — 15 of 15 (100 %)

Both prior passes' "likely PEPRI-dependent, not in this corpus" note about `CH` was WRONG, and
this pass corrects it. Capítulo II ("Condiciones particulares de la ordenación Centro Histórico
(CH)", Arts. 12.2.1–12.2.26, printed pp. 198-207) is a full, self-contained chapter INSIDE the
SAME `06_TR_NORMAS.pdf` every other Sevilla zone was read from — no separate PEPRI/PEPCCH
instrument exists or was needed. It was found by grepping `06_TR_NORMAS.txt`'s own full-text dump
for `12.2.` article numbers (already present in the held corpus, just never read for `CH`
specifically) and confirmed with a clean `pdftotext -f 199 -l 207` plain-mode re-extraction (the
same page range's `-layout` extraction badly interleaves this PDF's two columns, exactly the M/A/
etc. precedent this doc already notes).

`CH` reads as a NINTH structural refusal — front=0/side=0 (Art. 12.2.6 §1, mandatory alignment +
party-wall, same shape as `M`), but WORSE footing than any prior refusal: Art. 12.2.8 states
buildings may reach the REAR LOT LINE ITSELF as the DEFAULT case ("hasta el lindero trasero de la
parcela"), not merely an absent rule. Occupation (Art. 12.2.9 §1) is not even a percentage — it is
a COMPUTED area, `Mocp = Superficie de la parcela − 0.33 × Superficie del solar teórico`, where
"solar teórico" is itself built by a 5 m-inward geometric offset of the exterior alignment, with
five further size/use-conditional exceptions layered on top. Height (Art. 12.2.11 §2) and
edificabilidad (Art. 12.2.12 §1) are both per-parcel graphic/derived, same `null` shape as every
other zone. New guard: `SEVILLA_CH_OCUPACION_UNRESOLVED_RING`. `SEVILLA_PGOU_ZONE_CODES` now lists
ALL 15 live codes; `sevillaNoRulePackRefusal` is no longer reached unnamed by any live `zona_orden`
value.

Tests: `esSevillaEnvelope.test.ts` and `resolveSevillaZone.test.ts` both updated (pinned zone-list
assertions, the CH structural-refusal parametrized case, the CH ring-handle assertion). Full
package suite: **148 test files, 2831 tests, all passing** (up from the 2825-baseline + this
pass's own 2 new CH assertions + 4 new end-to-end-proof tests below).

## 9. 2026-08-05 (third continuation) — Part B: LIVE END-TO-END PROOF — SUCCEEDED

A real, live query against Sevilla's own ArcGIS `Calificación` service (layer 25) —
`.../MapServer/25/query?where=zona_orden+LIKE+'AD%25'&outFields=zona_orden,clase_cat,u_global,
det_comple,altura_max,enlace_ng,enlace_np&returnGeometry=true&outSR=4326&resultRecordCount=1&f=json`
— returned one real `AD: Unifamiliar Adosada` polygon feature (60-vertex ring). Its arithmetic-mean
centroid, **verified inside the polygon by a standalone ray-casting point-in-polygon check**
(not merely "near" it): `lon = -5.915929083067236, lat = 37.37790297821259`.

New test file `packages/site-parcel-data/__tests__/sevillaEndToEndProof.test.ts` (production code
untouched) feeds that REAL coordinate and the REAL captured attribute set through the actual,
unmodified chain: `resolveSevillaZone` (mocked `fetchImpl` returning the verbatim-captured live
response body, same "never a live call in CI" discipline as `resolveSevillaZone.test.ts`'s own
header) → the SAME `zonaOrden.split(/[:\s]/)[0].trim().toUpperCase()` derivation
`applySevillaZoningThenFallback` uses in `apps/editor/src/ui/site/siteDispatch.ts` → a real
`ZoningRecord` → the real, unmodified `computeBuildableEnvelope` against `ES_SEVILLA_PGOU_PACK`.

**Result: `status: 'ok'`, `insetAreaM2` = 960 m²** (a synthetic 30 m × 40 m parcel, front 4 m +
rear 4 m inset per AD's real Art. 12.7.3 §4 setbacks, side 0 m party-wall — `(30−0−0)×(40−4−4)`).
This proves the full pipeline — live zone lookup → matched, transcribed ordinance → computed
number — genuinely works end to end today for Sevilla's non-refused zones, pending only the human
sign-off gate. `SEVILLA_ENVELOPE_VERIFIED` was read, asserted `false`, and NOT touched (4th test in
the file). The parcel POLYGON itself is synthetic (Layer 25 publishes zoning classification, not
individual cadastral boundaries) — the zone IDENTITY and the ordinance MATCH are both real; only
the parcel shape is a stand-in, exactly as every other Sevilla envelope test in this package
already does.
