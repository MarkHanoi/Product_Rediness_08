# ENVELOPE — Córdoba (INE 14021)

> Per-municipality envelope status (ADR-0279 / `ENVELOPE-REPLICATION-STANDARD.md`; feeds C63 Axis 4).
> **Last updated:** 2026-07-30. **Maintainer:** UNASSIGNED.

## Status: PACK AUTHORED · **REGISTERED** · **GATED SHUT** · ENVELOPE axis = **0 %** (measured) — refusing

Córdoba is the **shape-B OCR city**: a modern consolidated plan (PGOU-2001) with clean scanned
ordinances. The extraction pipeline has run and the pack **is** registered — but nothing is
human-signed, so the dispatcher returns **no envelope**: a cited refusal, never a number.

> ⚠ **CORRECTED 2026-08-01.** This section previously read *"UNREGISTERED · nothing is registered"* and
> the slot table scored S2 and S5 as ❌. **All three were stale.** The router predicate, the L5 dispatch
> branch and the registry entry (13 subzones) all ship. What holds the numbers back is one constant,
> `CORDOBA_ENVELOPE_VERIFIED = false` — and that was established by **driving the real dispatch**
> (`apps/editor/__tests__/cordobaSiteDispatch.test.ts`), not by reading the code.

| Slot | What it is | State |
|---|---|---|
| **S1 — parcel provider** | Catastro INSPIRE WFS (national) + COACo `coaco:vcatastro_urbanismo` (5,725 pilot parcels) | ✅ national provider wired; block-ring dissolve **0/3** (`SPAIN-CADASTRAL-DISSOLVE-PROBE`) |
| **S2 — router predicate** | `providers/cordobaBbox.ts` → `isInCordoba` / `CORDOBA_BBOX` | ✅ **wired**, and routed by L5 (`applyCordobaZoningThenFallback`). ⚠ The box is the **pilot extent**, not the city |
| **S3 — zone source** | COACo calificación WFS (`coaco:ordenanzas`, 453 polygons) | ⚠️ **live for 2 of ~10 districts only** (Sur + Noroeste pilot, ~1.63 km²); elsewhere SIU *clasificación* = land class, not an envelope. ⚠ **No subzone RESOLVER is wired** (pack WIRING-TODO 5) — the Córdoba leg makes no planning network call at all today |
| **S4 — rule pack** | `esCordobaPGOU2001.ts` → `ES_CORDOBA_PGOU2001_PACK` | ✅ authored, 13 subzones; ⚠️ every value `pipeline-extracted-unverified` (scanned PDFs, single-pass vision) |
| **S5 — registration** | `rulepacks/registry.ts` | ✅ **REGISTERED** — `packsByZone: packMap([ES_CORDOBA_PGOU2001_PACK, CORDOBA_PGOU2001_ZONE_CODES])` |
| **S6 — the honesty gate** | `CORDOBA_ENVELOPE_VERIFIED` + [`sources/VERIFICATION.md`](./sources/VERIFICATION.md) | ⛔ **`false` / UNSIGNED** — this, and only this, is why the axis measures 0 % |

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
clean. **Do NOT flip `CORDOBA_ENVELOPE_VERIFIED` or reuse another municipality's numbers to make a
demo work** — an absent envelope costs nothing; a confident wrong one costs credibility (C58 §1.2,
§CONTEXT-DATA-HONESTY).

> ⚠ This paragraph used to say *"do not register the pack"*. Registration **has since happened**, on
> purpose and safely: it wires the pack, its refusal families and its extent into one table so the C60
> globe and the future subzone resolver cannot disagree, while the **dispatcher's gate refuses the
> whole pilot before the registry is consulted**. The line that must not be crossed is the **gate**,
> not the registration. Full posture, the residual latent risk it leaves, and exactly what a signature
> would and would not authorise: [`sources/VERIFICATION.md`](./sources/VERIFICATION.md).

## The human legal work to flip the gate

1. Human-verify the 15-ordinance OCR extraction against source crops (`pipeline-extracted-unverified` →
   `estimated-ruleset`), signing `sources/VERIFICATION.md` (L-449) — unlocks the pilot (~19 % full / ~89 % partial *within Sur + Noroeste*).
2. Extend the COACo calificación pilot beyond 2/10 districts (external / curation) — the only lever that
   raises the *municipality-wide* rate off ~0 %.
3. Build a Córdoba street-width resolver (Manzana Cerrada height table → parcel answer).
4. ✅ **DONE** — `esCordobaPGOU2001.ts` is registered. ⚠ It renders **only** after sign-off, and even
   then **only** at the `pipeline-extracted-unverified` amber tier, never `estimated-ruleset`.
5. ⚠ Steps 1 and the WIRING-TODO-5 subzone resolver must land **together**: a signature without the
   resolver renders nothing (no parcel can bind a subzone), and the resolver without a signature is
   inert. Sequencing them apart wastes the legal act.

*Cross-refs: C58, ADR-0279, C63 §3 Axis 4, `findings/OCR-EXTRACTION-RESULTS.md`,
`findings/CALIFICACION-ENDPOINT-PROBE.md`, `findings/ORDENANZA-PACK-SPEC.md`. Sibling:
[`LEGISLATION-RATE.md`](./LEGISLATION-RATE.md).*
