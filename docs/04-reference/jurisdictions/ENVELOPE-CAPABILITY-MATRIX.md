# Envelope Capability Matrix — per jurisdiction

> **Status:** LIVING DOCUMENT, updated on every material landing. Created 2026-08-03.
> **The one question this answers:** *"Today, if a user selects a parcel in this jurisdiction, can
> PRYZM generate a building envelope that is legally defensible?"* — measured by jurisdiction, not by
> dataset, not by area share, not by count of things discovered.
>
> **Companion to, not a replacement for:**
> | For | Read |
> |---|---|
> | The founder-mandated national KPI dashboard (envelope/refusal split, updated every reporting cycle) | [PEC-EXECUTION-DASHBOARD.md](../../03-execution/plans/PEC-EXECUTION-DASHBOARD.md) |
> | Whether DRAWN geometry overstates the legal right (a correctness axis, not a status axis) | [ENVELOPE-REALISM-MATRIX.md](./ENVELOPE-REALISM-MATRIX.md) |
> | Full jurisdiction rollout tracker (all 8 replication layers) | [GEOGRAPHIC-ROLLOUT-MASTER-TRACKER.md](../GEOGRAPHIC-ROLLOUT-MASTER-TRACKER.md) |

## The rule this matrix applies

**Status is `VERIFIED` only if a `*_ENVELOPE_VERIFIED` / `*_CERTIFIED` gate is signed `true`.**
Everything else is `UPPER_BOUND` (draws, claims no buildable right — `open-top-indicative`) or
`BLOCKED` (draws nothing). **Discovered-but-unwired evidence does not move a jurisdiction.** A
research finding moves this matrix only on the commit that wires it into `registry.ts` and/or flips a
gate — never on the commit that merely documents it.

⚠ Percentages below are directional engineering/data/legal splits, not measured resolution rates —
for the measured area-share and determination-split figures, the dashboard is authoritative.

## Matrix

| Jurisdiction | Status | Capability % | Eng % | Data % | Legal % | Blocking layer | Next unlock |
|---|---|---:|---:|---:|---:|---|---|
| **Barcelona** | VERIFIED (partial scope) | ~55% | 80% | 70% | 60% | overlays (all 6 families unmodelled, universal) | Overlay engine — the only thing that moves this number now |
| **Murcia** | ⚠ VERIFIED, live over-grant defect | ~40% | 60% | 65% | 50% | RL 7m cesión (Art. 5.14.3.3) still un-fixed on 16.53% of measured land | Land the cesión-as-exclusion-strip engineering (CRS half already fixed) |
| **Madrid NZ-1** | UPPER_BOUND (footprint ring only) | 15% | 40% | 55% | 30% | height (Art. 8.1.15.1, CPPHAN-discretionary — genuinely unavailable) | none — no dataset closes this specific gap |
| **Madrid NZ-3,4,5,7,8,9** | BLOCKED | 0% | 20% | 45% (PUB:ALIN found, unwired) | — | geometry ingestion — 59.1M m² of `Alineación Oficial` sits unread | Wire PUB:ALIN ingestion (dependency-graph rank-3 node) |
| **Balears** | UPPER_BOUND (listed 2026-08-03) | 20% | 70% | 35% | 20% | overlays + fitxa-to-article provenance unverified on 98% of zones | Confirm fitxa↔article on the top zones |
| **València** | BLOCKED (doctrine VALIDATED 2026-08-03, code not yet updated) | 10% | 30% | 60% | 90% | engineering only — `esValenciaEnvelope.ts:494-506` still says "offset unknown" | Implement the table lookup (Art. 6.19.1/6.25/6.30) — one file, doctrine already closed |
| **Córdoba** | BLOCKED — registered, gate `CORDOBA_ENVELOPE_VERIFIED` unsigned | 5% | 15% | 50% (49/49 sheets proven vector, unwired) | 40% | geometry ingestion — vectorised sheets never fed into the envelope path | Wire the Córdoba vectorised sheets, then a human signs |
| **Canarias** | BLOCKED | 5% | 20% | 45% | 30% | zoning — WMS reachable but vigencia is single-valued, not a live choice | Formal currency ruling, not more probing |
| **Zaragoza** | Partial — calificación coarse layer usable | ~20% | 40% | 55% | 40% | height/subgrado still article-dependent | not yet prioritised |
| **Huesca** | BLOCKED, correctly (refusal VALIDATED, exhaustive) | 5% | 20% | 30% | 20% | alignment — genuinely unpublished | `gis.huesca.es` from a different network — the one open lead |
| **Málaga** | NOT_STARTED — registry empty, but a research trail exists | 0% | 0% | unknown | 0% | not registered at all — `tools/andalucia-envelope-max/` has 10+ prior probe scripts (host sweep, GeoServer, PGOU schema, polcalif, normativa params) never wired or verified | Someone reads `tools/andalucia-envelope-max/out/*.json` before starting fresh — do not re-probe blind |
| **Andalucía (rest) / CyL / Galicia** | NOT_STARTED | 0% | 0% | 0% | 0% | — | no work done — not inventing a number here |

## Totals

- **Jurisdictions with any working envelope generation (VERIFIED or UPPER_BOUND): 3 of 12 tracked** (Barcelona, Murcia, Balears). 2 more (Madrid NZ-1, València) produce a partial/no-height or not-yet-wired output.
- **% Spain land area with working envelope generation: cannot state.** Each city's percentage above is a share of *that city's own* buildable land, not of Spain — no national denominator exists yet (C64 §2.13 flags the denominator itself is being restated to the cadastral parcel).
- **% parcels theoretically processable: cannot state.** No parcel census exists anywhere in the repo. Every figure here is area or field-count, never parcel-count. This is the standing measurement gap, tracked, not a research gap.
- **Biggest single unlock available: Madrid `PUB:ALIN`** — 59.1M m², already published, sitting unread, strictly upstream of street width too.

## Update discipline

- A row moves **only** on a commit: a `registry.ts` wiring, a gate flip (human-signed, L-449), or an
  engineering fix landing. A research finding alone — however strong — updates the "Next unlock"
  column, never the Status or Capability % column.
- Every status change in this file should cite the commit hash that caused it.
- If a jurisdiction is touched and this file is not updated in the same session, treat this file as
  stale for that jurisdiction until re-checked — do not assume it is current.

## Change log

| Date | Change |
|---|---|
| 2026-08-03 | Created. Initial 12-jurisdiction snapshot following the Balears open-top listing (`c14d1e2e`) and the València `altura` falsification (`VALIDATED`, agent `ad66bfccf2b913334`, not yet wired). Málaga row added after founder flagged existing unwired `tools/andalucia-envelope-max/` probe trail. |
