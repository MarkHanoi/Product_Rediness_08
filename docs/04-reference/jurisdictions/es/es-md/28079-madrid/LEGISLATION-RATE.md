# LEGISLATION-RATE — Madrid (`es-md`, INE 28079) city

> **Naming note (L-649 reconciliation, 2026-07-30).** This file was `RATE.md`; its content is the
> **structured legislation / data-fill rate** (the C58/L-449 comparable ruler), which the
> [`NAMING-CONVENTION`](../../_TEMPLATE/NAMING-CONVENTION.md) §1 names `LEGISLATION-RATE.md`. It now
> **feeds** the composite master [`RATE.md`](./RATE.md) (the 7-axis C63 scorecard) as **Axis 2
> (LEGISLATION)**. Content is unchanged — only the filename moved.

**Headline rate: ~68%**

> **Structured dimensional fill rate** — the fraction of parcel-level building-rule queries that
> return a complete, machine-readable answer (**zone/use code + a density metric [FAR / coverage /
> BYA / BRA / %-utilisation] + height**) **without reading an ordinance text/PDF**. This definition
> is IDENTICAL across every jurisdiction (Denmark / Madrid / Saudi / Barcelona / Norway / Germany /
> France …) so the scores are directly comparable. Derived from direct endpoint/schema checks, not
> assumed from the jurisdiction's open-data reputation.

| Jurisdiction | Rate |
|---|---|
| Denmark | ~96% |
| **Madrid** | **~68%** |
| Saudi (national) | ~55% |
| Barcelona | ~48% |
| Spain (national) | ~34% |
| Norway (national) | ~32% |
| Germany (national) | ~28% |
| France (national) | ~22% |

Madrid is the **richest urbanistic-data city in the Spanish set** and the second-highest in the whole
benchmark, behind only Denmark. Its ~68% is driven by data the other Spanish cities do not publish:
**NZ 1 (Protección del Patrimonio Histórico) publishes the buildable footprint (`Fondo de la
Edificación`) AND the weighted edificabilidad (`COEF_Z`) as live queryable ArcGIS geometry+attributes**
(verified live 2026-07-23, `findings/L-608-MADRID-PACK-SPEC.md` §2.1) — a genuinely structured envelope
for the historic core, the first real case of the `explicit-area` model. On top of that the
calificación / Norma-Zonal plane (`PG_ORDENACION`), the `Alineaciones` layer, and an ámbito-level
`Visor_Edificabilidad` service are all published.

⚠ **Two honesty caveats that qualify the 68%, stated up front (C58 §1.4):**
1. **The metric measures DATA readiness, not PRYZM's current wiring.** Madrid's *shippable* envelope
   resolution TODAY ≈ 0% — NZ 4/8 are document-gated (numbers in the NNUU PDF) and NZ 1 is
   WIRING-gated (⚠ the `explicit-area` solver **has since SHIPPED** — C58 §2.2 KG-4 is OPEN; what remains is a same-origin proxy + a one-line `explicitAreaFootprint` interface fix + L-449). The ceiling once
   the four Normas Zonales are sourced and NZ 1's solver ships is **~60–62% of residential clicks**
   (0.65 × 0.96). The ~68% data-readiness rate sits *above* that engine ceiling because it credits
   structured layers PRYZM has not yet consumed.
2. **The per-Norma-Zonal land-share split is UNSOURCED.** The exact figure carries that uncertainty —
   68% credits Madrid's structured calificación + NZ 1 footprint + ámbito edificabilidad, but a strict
   per-field read lands lower for the NZ 4 (manzana cerrada) core, whose *fondo edificable* is
   grado-structured in the PDF. Do not present 68% as a precision measurement.

---

## Field-by-field breakdown

| Field | Structured? | Source | Score |
|---|---|---|---|
| Parcel geometry | ✅ Structured | Catastro INSPIRE WFS (national). Block ring: `dissolveParcelsToBlockRing` **2/4 in Madrid** (`SPAIN-CADASTRAL-DISSOLVE-PROBE`) — weaker than Barcelona's 2/2. | **~90%** (geometry national; block-ring tolerant-mode gap) |
| Plan/zone existence + boundary | ✅ Structured | PGOUM-97 planes on `sigma.madrid.es/hosted/rest/services/pgoum97` — 12 services, live. | **~85%** |
| Zone/use code (Norma Zonal) | ✅ Structured (PRIOR-VERIFIED) | `PG_ORDENACION` calificación plane — per-parcel Norma Zonal + uso pormenorizado. (⚠ returned HTTP 500 on the 2026-07-23 re-probe; PRIOR-VERIFIED, not re-confirmed this pass.) `PG_ORDENACION_SIN_AMBITO` L4 = a dedicated NZ 1.5 polygon, L5 = Alineaciones. | **~75%** |
| Density metric (edificabilidad / FAR) | ⚠️ Partial — split by NZ | **NZ 1: LIVE DATA** — `COEF_Z` (String, coded, per-manzana, parsed under assertion) on layer 6. Ámbito-level `Visor_Edificabilidad` (Jan-2024) — **wrong granularity** (C58 §1.11), context only. **NZ 4/8/5/7: PDF** — grado-structured *fondo/edificabilidad* in the NNUU **Compendio 2025 (24-09-2025)**. | **~40%** |
| Max height (parcel-level) | ⚠️ Partial | NZ 1 conditions ride with the footprint plane. NZ 4/8 *altura de cornisa / nº plantas*: grado-structured in the NNUU PDF, not sourced this pass. | **~30%** |
| Setback / alignment (ADR-0270) | ✅ Kind resolved; ⚠️ numbers split | NZ 1 → `explicit-area` (footprint published); NZ 4 → `alignment` (**`Alineaciones` published as a layer** — the official line is structured; the *fondo edificable* depth is PDF); NZ 8/5/7 → `setback` (retranqueos PDF); NZ 3 → `derived-plan` refusal. The SHAPE is fully resolved; the numbers are the gate. | **~50%** |
| Building footprint + height (LOD1/2) | ✅ / ⚠️ | Catastro constructions (national footprint). **NZ 1's `Fondo de la Edificación` polyline IS the published buildable boundary** — Madrid publishes buildable depth as a *line you build to*, not a setback (the reason `explicit-area` exists, `es/README.md`). Height coarse. | **~55%** |
| Terrain (DTM/DSM) | ✅ / ❌ | IGN MDT + Cesium World Terrain. nDSM ❌. Same rasant-datum caveat as Barcelona applies. | **~85%** terrain; nDSM ❌ |
| Heritage overlay | ⚠️ Partial | NZ 1 IS the historic-protection zone and it is published as data (unlike Barcelona's invisible Ciutat Vella overlay) — a genuine Madrid advantage. NZ 2 (colonias históricas) less so. | **~40%** |

---

## The structural gap

**Madrid's data is richer than Barcelona's, and the gap is engine + document, not classification.**
The zone code is live and structured, and for NZ 1 the *density and the footprint are published
geometry* — the historic core is a solved data case, the first real `explicit-area` zone. That is why
Madrid clears 68% where Barcelona sits at 48%: Barcelona must *construct* its density from the block
ring, Madrid *publishes* it for the core.

The residual to Denmark's 96% is two-part. First, the dominant residential typology — **NZ 4 manzana
cerrada** — states its *fondo edificable* and *retranqueos* per grado in the PGOUM-97 NNUU (Compendio
2023, Cap. 8.x), a prose PDF; those numbers were not transcribable citeably this pass (the compendio
returned as compressed streams; web-search hits mixed a specific APR plan's values with the general
norm — the exact secondary-source trap). Second, **~35% of residential land sits in a derived ámbito**
(APR/APE/API/Plan Parcial) — the Madrid analogue of Barcelona's derived-planning trap: the general
plan points at a per-site document, so the honest output is a `derived-plan` refusal, not an envelope.
The Zod schema enforces this honesty: `AlignmentRuleSchema.buildableDepth_m` must be `.positive()` and
`SetbackRuleSchema` needs the full triple — there is no way to author a functional NZ 4/8 pack without
the sourced numbers.

---

## What would raise the rate

| Action | Rate impact | Effort |
|---|---|---|
| Human-source NZ 4 *fondo edificable* + NZ 8 retranqueos from **Compendio 2025 (24-09-2025)** Cap. 8.x, per grado (L-449) | The single highest-leverage move — NZ 4 is central Madrid's dominant residential typology | High (human, per-grado read) |
| Build the `explicit-area` engine branch + the NZ 1 ringRef resolver (KG-4) | Unblocks NZ 1's live footprint data into a shipped envelope; reusable for every footprint-publishing jurisdiction | Medium (one engine unit) |
| Re-verify `PG_ORDENACION` live + run `returnCountOnly` before believing any zero | Re-confirms the calificación endpoint (currently PRIOR-VERIFIED only) | Low — one probe |
| Ship the NZ 3 `derived-plan` refusal (copy in `sources/SOURCES.md`) | Turns the volumetría-específica share into a cited answer now | Low |
| Verify `COEF_Z` coding + parse (defensive — an un-asserted `parseFloat` on a coded string is a silent-zero risk) | Makes NZ 1 edificabilidad shippable, not just present | Low |

---

*Last updated: 2026-07-24. NZ 1 `COEF_Z` + `Fondo de la Edificación` footprint confirmed LIVE DATA
(2026-07-23). `PG_ORDENACION` calificación plane PRIOR-VERIFIED (HTTP 500 on re-probe, not
re-confirmed this pass). NZ 4/8/5/7 numbers DOCUMENT-gated (NNUU **Compendio 2025 (24-09-2025)**), unsourced. Shippable
envelope resolution today = 0% (MEASURED: `packsByZone` empty — wiring-gated + document-gated); data-readiness ~68%; engine ceiling
~60–62%; per-NZ land-share split UNSOURCED. Maintainer: UNASSIGNED.*
