# ENVELOPE — Córdoba (INE 14021)

> Per-municipality envelope status (ADR-0279 / `ENVELOPE-REPLICATION-STANDARD.md`; feeds C63 Axis 4).
> **Last updated:** 2026-07-30. **Maintainer:** UNASSIGNED.

## Status: PACK AUTHORED · UNREGISTERED · `not-assessed` (`pending-implementation`) — refusing

Córdoba is the **shape-B OCR city**: a modern consolidated plan (PGOU-2001) with clean scanned
ordinances. The extraction pipeline has run, but nothing is human-signed and nothing is registered, so
the dispatcher returns **no envelope** — a cited refusal, never a number.

| Slot | What it is | State |
|---|---|---|
| **S1 — parcel provider** | Catastro INSPIRE WFS (national) + COACo `coaco:vcatastro_urbanismo` (5,725 pilot parcels) | ✅ national provider wired; block-ring dissolve **0/3** (`SPAIN-CADASTRAL-DISSOLVE-PROBE`) |
| **S2 — router predicate** | per-city bbox in `providers/` | ❌ no live Córdoba router pack |
| **S3 — zone source** | COACo calificación WFS (`coaco:ordenanzas`, 453 polygons) | ⚠️ **live for 2 of ~10 districts only** (Sur + Noroeste pilot, ~1.63 km²); elsewhere SIU *clasificación* = land class, not an envelope |
| **S4 — rule pack** | `esCordobaPGOU2001.ts` (authored starter pack) | ⚠️ **authored but UNREGISTERED**; every value `pipeline-extracted-unverified` |
| **S5 — registration** | `rulepacks/registry.ts` | ❌ not registered (no live Córdoba pack) |

## Why the answer is a refusal, not a number

Three cited facts hold Córdoba's shippable envelope at effectively 0 % municipality-wide — **all
documented, none a data-quality excuse** (see [`LEGISLATION-RATE.md`](./LEGISLATION-RATE.md) +
`findings/OCR-EXTRACTION-RESULTS.md`):

1. **Calificación geometry is published for 2 of ~10 districts** (COACo pilot). Everywhere else a click
   resolves to SIU *clasificación* (urbano / urbanizable / no urbanizable) — not an envelope.
2. **Every extracted density/height is `pipeline-extracted-unverified`** — single-pass vision, no L-449
   sign-off. `SOURCES.md §C` (the verified table) is empty; nothing ships `structured`.
3. **The two dominant families are not even scalars.** Manzana Cerrada states its height as a
   *per-street-width TABLE* (null scalar until a Córdoba street-width resolver exists — the same gap as
   Barcelona) and its edificabilidad **DERIVED by algorithm**; Colonia Tradicional Popular's
   edificabilidad is DERIVED too. The pipeline correctly emits `null` rather than manufacture a value.

⚠ **The CEILING is far higher than the rate.** The OCR pilot MEASURED ~19 % of pilot parcels get a
*fully-numeric* envelope and ~89 % a *partial* one **after human sign-off**. Córdoba's problem is
**pilot COVERAGE (2/10 districts) + verification**, not OCR — the OCR is done and the documents are
clean. **Do NOT register the pack or reuse another municipality's numbers to make a demo work** — an
absent envelope costs nothing; a confident wrong one costs credibility (C58 §1.2, §CONTEXT-DATA-HONESTY).

## The human legal work to flip the gate

1. Human-verify the 15-ordinance OCR extraction against source crops (`pipeline-extracted-unverified` →
   `estimated-ruleset`), signing `sources/VERIFICATION.md` (L-449) — unlocks the pilot (~19 % full / ~89 % partial *within Sur + Noroeste*).
2. Extend the COACo calificación pilot beyond 2/10 districts (external / curation) — the only lever that
   raises the *municipality-wide* rate off ~0 %.
3. Build a Córdoba street-width resolver (Manzana Cerrada height table → parcel answer).
4. Register `esCordobaPGOU2001.ts` behind a `pipeline-extracted-unverified` amber tier only after sign-off.

*Cross-refs: C58, ADR-0279, C63 §3 Axis 4, `findings/OCR-EXTRACTION-RESULTS.md`,
`findings/CALIFICACION-ENDPOINT-PROBE.md`, `findings/ORDENANZA-PACK-SPEC.md`. Sibling:
[`LEGISLATION-RATE.md`](./LEGISLATION-RATE.md).*
