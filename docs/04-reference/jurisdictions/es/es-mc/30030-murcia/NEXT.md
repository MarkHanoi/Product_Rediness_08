# NEXT — Murcia (INE 30030, Región de Murcia)

> Where PRYZM stopped, why, the smallest next step. **Last updated:** 2026-08-01. **Maintainer:** UNASSIGNED.
> **Status:** PARCEL live · ZONING live · **ORDINANCE SOURCED + TRANSCRIBED, gate closed** · heights unbaked.

## 0 — WHAT THIS FILE SAID BEFORE, AND WHY IT WAS WRONG

The previous revision recorded *"No rule pack → no envelope"* and gave *"enumerate the distinct
zones … (one query)"* as the smallest next step. Both were stale:

- S2 / S3 / S5 were wired on 2026-07-31 (`60d11aea`, corrected `7333374f`) — the zones were already
  being enumerated live from Murcia's own GeoServer at every click.
- The governing instrument has now been **sourced and transcribed** (2026-08-01).

## 1 — WHERE WE STOPPED

The **PGOU de Murcia, Normas Urbanísticas, Texto Refundido diciembre 2012** (205 pp, born-digital,
embedded title `TR PG vol_11 NN UU.signed.pdf`) was retrieved from `urbanismo.murcia.es` and read.
14 calificaciones whose every envelope-determining parameter is STATED at parcel granularity are
transcribed into `packages/site-parcel-data/src/rulepacks/esMurciaPgou2012.ts`, each with article +
verbatim quote; 11 more are classified and **refused with a citation**.

The pack is **reachable from the real dispatch** and **gated**: `MURCIA_ENVELOPE_VERIFIED = false`,
so no number renders. Full calificación table in `ENVELOPE.md` §3.

## 2 — 🔴 THE CEILING — the census's ~75 % does NOT survive

Base: the orchestrator's land-class census
([`findings/MURCIA-LAND-CLASS-AND-DERIVED-PLAN-SPLIT.md`](./findings/MURCIA-LAND-CLASS-AND-DERIVED-PLAN-SPLIT.md),
`45a8af74`). Its four open items are closed in
[`findings/MURCIA-DERIVED-PLAN-SPLIT-RESOLVED.md`](./findings/MURCIA-DERIVED-PLAN-SPLIT-RESOLVED.md),
and two of them move the headline:

1. **The 19.3 % null `categoria` block is 100 % derived-plan ámbitos** (PU/PM/UE/PI/UD/PC/PH/PE/
   PERI/PT/PX/PB/PA/PR/PEI/PP/PEE — no residue). Delegated rises 24.8 % → **38.2 %** on the
   census's own method, with no re-measurement.
2. **`US` delegates, conditionally.** Art. 5.14.2 remits the ordering to a *Plan Especial de
   Adecuación Urbanística*; Art. 5.14.3 supplies an interim directly-applicable regime at the same
   0,25 m²/m². It cannot be counted as unconditionally direct.

| Method | denominator | direct | delegated |
|---|---|---:|---:|
| Census, sector-code test | Urbano 56.0 M m² | ~75 % | 24.8 % |
| Census method, `US` + null resolved | Urbano 56.0 M m² | **39.5–61.8 %** | **38.2 %** |
| True polygon area, calificación-aware | buildable 75.1 M m² | **33.0 %** | **67.0 %** |

The third row is lower again because **41.4 pp of the delegation is published on the `calificacion`
attribute** (*genérica* RX/RJ/RS/UC/IP/TC/GP/AE, Arts. 5.25.3.3/5.26.3.3/6.5.1; *remitted*
RR/TR/IR/GR, Arts. 5.24.5/5.24.6) — a shape a sectores-layer census cannot see. GENOME TEST 01 §4.2
again, in a third form.

**Murcia is comparable to Barcelona (62.8 % delegated), not clearly better.**

**No amount of further transcription moves this.** It is the plan's own design (Arts. 5.24, 5.25,
5.26, 6.2.2, 6.5.1, 6.6).

### 2.1 — ⭐ AND THE CROSS-TAB IS NOW RUN: the prize is **23.51 %**, not 33 %

`33 % of 75.1 km²` was the *land the PGOU orders directly* — not the land the pack answers for.
The calificación × clase-de-suelo cross-tab (2026-08-01,
[`tools/murcia-coverage-crosstab/`](../../../../../../tools/murcia-coverage-crosstab/README.md))
intersects the two:

| | km² | share of buildable |
|---|---:|---:|
| 14 packed calificaciones by code | 29.270 | 38.95 % |
| **packed AND PGOU-direct — what a signature renders** | **17.663** | **23.51 %** |
| firm floor, excluding the interim `RL` (Art. 5.14.3) | 5.238 | **6.97 %** — ⚠ corrects a published 16.5 % |

The tool reproduces the whole prior baseline from the live layers before computing anything new,
which is what makes the new number quotable. Re-run it before quoting externally; these are live
services.

## 2.2 — ⭐ STATUS 2026-08-01 (late): **MURCIA RENDERS.** The 23.51 % is live, not pending

Three things landed after §2.1 was written, in this order — the order is the point:

1. **§MURCIA-GATE-BYPASS-REGRESSION (was LIVE).** SIG-MU1 flipped the gate to `true`, but the L5
   dispatcher guarded on `if (!MURCIA_ENVELOPE_VERIFIED && resolution.ok)` — so the flip made the
   whole disposition **unreachable** and every parcel fell to the generic `no-rule-pack` refusal.
   The signature had made Murcia **strictly worse**: no envelope, *and* the 67 % delegated land lost
   its cited `derived-plan` article. `murciaSiteDispatch.test.ts` was already RED on `main`.
2. **R-7 CLOSED.** The disposition applied 1 of the PGOU's 4 delegation grounds; the *clase de
   suelo* (Art. 6.2.2.3) and UE/UD/P\* (Arts. 5.25.1/5.25.2/5.26.2) tests are now in, above the
   PGOU-direct block. Without this, rendering would have published on 13.09 pp of delegated land.
3. **§MURCIA-ENVELOPE-RENDER built.** Measured end-to-end: `RL` on `Urbano` → inset **315.0 m²**,
   **7 m**, 2 plantas, `estimated-ruleset`, every constraint citing Art. 5.14.3 verbatim.

⇒ **§3's first two blockers below are DISCHARGED** (the signature; the L5 `envelope` branch), and
the 🔴 `murciaEnvelopeDisposition` delegation-test blocker is **CLOSED**. The street-width blocker
and the two 🟠 source-provenance blockers stand unchanged.

## 3 — BLOCKERS

- 🔴 **Signature.** Transcription is a legal act. `sources/VERIFICATION.md` does not yet exist and
  must be human-signed (L-449) before `MURCIA_ENVELOPE_VERIFIED` flips.
- 🟠 **BORM approval reference `not-located-in-source`.** We hold the normative text, not the
  gazette act that enacted it. That is *not located*, not *does not exist*. **STILL OPEN.**
- ✅ ~~**2017 re-edition undiffed.**~~ **CLOSED 2026-08-01 (L-676).** Both consolidations are filed in
  [`corpus/pdf/`](./corpus/pdf/) with SHA-256s and diffed article-by-article: **all 22 cited zone
  articles are BYTE-IDENTICAL**; the 4 cited articles that differ move no published value. And the
  worry was **backwards** — the murcia.es «act. 28_02_2017» file is the **earlier** consolidation
  (the 2012 TR carries Arts. 2.1.10 + 6.2.7/zone `ZE` it lacks, and corrects a stale Art. 5.1.5
  cross-reference). PRYZM cites the LATER text. See [`corpus/INDEX.md`](./corpus/INDEX.md) §2–§3.
- ✅ ~~**Cited document not in the repo (L-674).**~~ **CLOSED 2026-08-01.** ⚠ And the recorded reason
  was FALSE: the *"HTTP 403"* was measured on the **directory index**; the PDF returns **200** to
  plain `curl`. `esMurciaPgou2012.ts:12` had recorded that 200 and the exact byte count all along —
  two artefacts disagreed and nobody diffed them. **Probe the artefact, not its container.**
- 🟠 **No Murcia street-width / frontage-class source.** Blocks `RC`, `RM` (base), `RN`, `RD1`'s
  third storey, `MZ`'s FAR and `MX`'s frontage rule — **8.81 % of buildable land** (⬆ measured
  2026-08-01; the earlier "~4 %" omitted the `RM` base zone), one resolver. It sits entirely inside
  the 33.00 % ceiling and entirely outside the 23.51 % a signature renders, so it is **strictly
  additive** to signature coverage.
  **SURVEYED 2026-08-02 — every candidate probed and refused** (`ENVELOPE.md` §3.3.1): `Murcia:viales`
  is centrelines with no width; `Murcia:comunicaciones_poligonos` is the 1:5 000 *carretera* network
  and returns **4 features over the whole Casco Antiguo**, so the streets that need a width are not in
  it; `pgou_eje_comercial` / `pgou_ejes` are axes with no section; the per-zone fiche PDFs **404**.
  ⇒ **It is not a SOURCING problem — it is ENGINEERING.** The PGOU measures between *alineaciones*,
  so the input is the void between `pgou_alineaciones` polygons, a layer PRYZM already fetches.
  ⚠ **But it moves 0 pp without SIG-MU2**: SIG-MU1 expressly does not authorise resolving this
  blocker or any number for the refused calificaciones. Build first, sign after — the axis moves on
  the signature, not the build.
- 🟠 **L5 does not consume an `envelope` disposition.** Interlocked today (the branch carries a
  `reason` and degrades to a cited refusal), but it must be taught before the gate opens, or Murcia
  will silently keep refusing after sign-off.
- 🔴 **`murciaEnvelopeDisposition` applies only ⅓ of the PGOU's delegation test** — sector prefix
  (`TA TM UA UH UM`) and nothing else. No *clase de suelo* test (Art. 6.2.2.3), no `UE` / `UD` /
  `P*` (Arts. 5.25.1 / 5.25.2 / 5.26.2). Opening either gate without fixing this publishes a
  general-plan number on **13.09 pp** of delegated land and takes rendered coverage to **36.59 %**,
  *above* the 33.00 % the PGOU orders directly. Measured; see `RISK-REGISTER.md` §R-7. **This is now
  the first item in any sign-off change, ahead of the L5 branch.**
- 🔴 **Heights unbaked** → see `HEIGHT.md`.

## 4 — SMALLEST NEXT STEP

~~**Verify five zones, not fourteen.**~~ **DONE AND OVERTAKEN (2026-08-01):** the source PDF is in
`corpus/pdf/`, all 22 cited articles are diffed against the second consolidation, and SIG-MU1 is
signed — Murcia renders on 23.51 % of buildable land.

**The smallest next step is now `classifyEdges`, not more transcription.** The founder's live RM1
report (L-676) was settled in the engine: the 15 m *fondo máximo edificable* **does** bind
(`packages/site-parcel-data/__tests__/murciaRm1DepthBand.test.ts` — a 38.3 × 17.5 m plot yields
574.5 m², not 670 m²), so the 671 m² is **not** an L-616 overstatement from that branch. Three
defects were found and fixed alongside it (missing parcel ring on the card, no length guard on
`edgeClassifications`, a Catalan string on a Castilian card). **One remains open and it is the
likeliest residual cause:** `boundaryProjection.classifyEdges` picks `front` purely by orientation
(the edge whose normal points most toward −Z), not by street adjacency. On an irregular 8-edge plot
that can select a **0.5 m sliver**, and a 15 m band measured off a sliver retains most of the
polygon — which would produce a near-whole-plot footprint under a binding cap. It is **cross-city**
shared code, so it needs an owner and an ADR, not a unilateral edit from a city agent.

**The street-width unlock is now HALF BUILT (2026-08-02).** `esMurciaAnchoDeCalle.ts` holds the four
ordinance tables (9 bands, verbatim, 20 tests) — Murcia's *"(b) height table keyed on street width"*
in `geometry/streetWidth.ts`'s own regional contract. **Three things stand between it and 8.81 pp:**

1. **A BBOX fetch** of neighbouring `Murcia:pgou_alineaciones` polygons. `/api/es/murcia-pgou`
   resolves a **point**; `measureStreetWidths` needs the rings **across the street**. This is the
   only genuinely new I/O in the whole unlock, and Murcia is unusually well placed for it — the
   municipality publishes the **alineación polygons directly**, so this path does **not** depend on
   `dissolveParcelsToBlockRing`, the Spain-wide failure that blocks Madrid (2/4) and Córdoba (0/3).
2. **ADR-0275's snap gate, re-run for Murcia.** The quantum set is city-specific; Murcia is not in
   the five-city probe. *Cluster ⇒ snap; no cluster ⇒ raw measured width, and say so.*
3. **SIG-MU2** — drafted and unsigned in [`sources/VERIFICATION.md`](./sources/VERIFICATION.md).

⚠ And the ceiling is **32.32 % of buildable land as an UPPER BOUND**, not a forecast: the resolver
refuses on `band-edge`, and `measureStreetWidths` refuses on `inconsistent` / `no-opposing-frontage`.
The realised share is UNMEASURED until the fetch exists. Re-run the crosstab before quoting it.

## 5 — THE REGISTRY SNIPPET (apply by hand; deliberately NOT applied by this work)

`rulepacks/registry.ts` is being appended to by another agent, so this is supplied rather than
applied. Add it alongside the existing `es-30030-murcia` refusal registration — **after** sign-off:

```ts
// ── Murcia (INE 30030) — the TRANSCRIBED PGOU pack. ────────────────────────────────────────
// PGOU de Murcia, Normas Urbanísticas, Texto Refundido diciembre 2012 (Vol. 11). 14 zones, each
// carrying its article and a verbatim quote. ⚠ Two thirds of Murcia's private buildable land never
// reaches this pack — the PGOU delegates it (Arts. 5.24 / 5.25 / 5.26 / 6.2.2 / 6.5.1 / 6.6) — and
// those parcels keep the legally-grounded `derived-plan` refusal. See ENVELOPE.md §2.
//
// ⚠⚠ DO NOT ADD THIS UNTIL `sources/VERIFICATION.md` IS HUMAN-SIGNED AND
// `MURCIA_ENVELOPE_VERIFIED` IS TRUE. Registering the pack while the gate is shut is harmless
// today (L5 refuses before it ever reads a pack) but it removes the one structural reminder that
// the transcription is unverified.
import { ES_MURCIA_PGOU2012_PACK } from './esMurciaPgou2012.js';

// …inside the `es-30030-murcia` JurisdictionCoverage entry, replace the empty map with:
packsByZone: Object.fromEntries(
    ES_MURCIA_PGOU2012_PACK.zones.map((z) => [z.code, ES_MURCIA_PGOU2012_PACK]),
),
```

## 6 — ALREADY BUILT (do not redo)

- Terrain bake row `terrain.mjs` TERRAIN_CITY `murcia` (PNOA MDT).
- National parcel routing `parcelProviders/registry.ts` (`isInSpain`→Catastro).
- Baked OSM context via `bake.mjs` REGIONS `spain`.
- S2 gate `isInMurcia`; S3 live resolver `resolveMurciaZoning` + proxy `/api/es/murcia-pgou`;
  S5 registration `es-30030-murcia`.
- **S4 pack `esMurciaPgou2012.ts`** + 23 tests in `__tests__/murciaPgou2012.test.ts`.
- The derived-plan refusal path, including `detectDerivedPlanMarkers`, which reads the governing
  instrument out of the cadastral address string.

*See also: `RATE.md` · `LEGISLATION-RATE.md` · `ENVELOPE.md` · `HEIGHT.md` · `RISK-REGISTER.md`.*
