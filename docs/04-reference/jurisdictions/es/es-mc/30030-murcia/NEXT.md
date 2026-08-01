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

## 3 — BLOCKERS

- 🔴 **Signature.** Transcription is a legal act. `sources/VERIFICATION.md` does not yet exist and
  must be human-signed (L-449) before `MURCIA_ENVELOPE_VERIFIED` flips.
- 🟠 **BORM approval reference `not-located-in-source`.** We hold the normative text, not the
  gazette act that enacted it. That is *not located*, not *does not exist*.
- 🟠 **2017 re-edition undiffed.** «NORMAS URBANÍSTICAS REFUNDIDAS ADAPTADAS A LS REG. act.
  28_02_2017» (196 pp) is the version the municipality links publicly. Every quote in the pack came
  from the 2012 TR. Concordance is UNVERIFIED.
- 🟠 **No Murcia street-width / frontage-class source.** Blocks `RC`, `RM` (base), `RN`, `RD1`'s
  third storey, `MZ`'s FAR and `MX`'s frontage rule — **8.81 % of buildable land** (⬆ measured
  2026-08-01; the earlier "~4 %" omitted the `RM` base zone), one resolver. It sits entirely inside
  the 33.00 % ceiling and entirely outside the 23.51 % a signature renders, so it is **strictly
  additive** to signature coverage.
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

**Verify five zones, not fourteen.** Take `RL`, `RD`, `IX`, `RF`, `MC` — together the large majority
of the PGOU-direct land — and check each transcription against the source PDF. That is the smallest
unit of work that converts into a signature and a rendered envelope.

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
