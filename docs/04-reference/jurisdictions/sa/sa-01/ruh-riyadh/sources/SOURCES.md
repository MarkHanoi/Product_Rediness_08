# Riyadh (`sa-ruh-riyadh`) — per-field sources

**Status:** PARTIAL → UPGRADED. Footprint fields are `published` (primary decision); as of L-606 the
clause numbers are **machine-transcribed** (column below). The only remaining `structured`-tier gate is
the human `VERIFICATION.md` sign-off → until signed the pack ships `estimated-ruleset`, NOT `structured`.
National detail: [`../../../sources/SOURCES.md`](../../../sources/SOURCES.md).

## A — VERIFIED (one row per value the pack sets) — clause-cited
| Field (pack key) | Value | Unit | Governing clause | Document (title + date) | URL / handle | Confidence |
|---|---|---|---|---|---|---|
| `sa-villa.maxCoverage` | `0.75` | ratio | **§4-1 cl. 1** | قرار 1/4500943139, 1446 H | momah.gov.sa / balady.gov.sa | `published` |
| `sa-apartment.maxCoverage` | `0.65` | ratio | **§4-2 cl. 1** | same | same | `published` |
| `setback.front` (resolved) | `max(w/5, 3)` | m | **§4-1 cl. 4 / §4-2 cl. 4** (≥6 m at w≥30 m §4-1 cl. 5) | same | same | `published` |
| `setback.side` / `setback.rear` (resolved) | `max(w/5, 2)` | m | **§4-1 cl. 4 / §4-2 cl. 4** | same | same | `published` |
| `permittedUse` (both) | `residential` | — | **§3-1 / §3-2** | same | same | `published` |
| `SA_MAX_HEIGHT_M.villa` (ceiling, not rendered) | `≤ 14` | m | **§5-1-5 cl. 3** (+ §3-1 ≤ G+1+annex) | same | same | `published` |
| `SA_MAX_HEIGHT_M.apartment` (ceiling, not rendered) | `≤ 23` | m | **§3-2** (+ §2 high-rise def, §1-1) | same | same | `published` |

> `setback.*` is `null` in the shipped pack (the width-dependent template) and filled per-parcel by
> `saRiyadhResolvedPack()` with `ordinance-pdf` provenance — the resolved value IS an ordinance
> construction, so `ordinance-pdf`, never `published-structured`.

## B — UNVERIFIED / open (stays `null` in the pack)
| Field | Why not verified | What would verify it |
|---|---|---|
| `maxHeight_m` — the **EXACT** value | The national CEILING (≤14 m villa / ≤23 m apt) is cited in §A; only the exact value beneath it is municipal (§4 cl. 1) + dev-authority override (§1 cl. 3); reachable sources geo-fenced. | In-SA read of RCRC/ADA per-zone height table, or Balady data agreement. |
| `maxFloors` — the **EXACT** value | Same (villa is nationally capped ≤ G+1+annex §3-1; exact per §4 cl. 1). | Same (Balady `NOOFFLOORS`). |
| `plotRatioFAR` | Does not exist in the residential regime. | — (genuine absence). |
| clause NUMBERS for the `published` rows | ✅ **NOW TRANSCRIBED** (L-606, machine, from the PDF — see §A). | ☐ Remaining gate: the **human `VERIFICATION.md` sign-off** (L-449) — the last step to `structured`. |

⚠ Neighbour-side setback (1.5 villa / 2–3 apt, Ch. 4 §4.2) is a real value but is NOT in the
street-facing triple the pack resolves — recorded as a pack constant (`SA_NEIGHBOUR_SIDE_M`), applied
only when a party edge is classified. Not a shipped zone field.
