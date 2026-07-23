# Riyadh (`sa-ruh-riyadh`) — per-field sources

**Status:** PARTIAL. Footprint fields are `published` (primary decision, page-cited); clause numbers
not yet transcribed and no `VERIFICATION.md` sign-off → the pack ships `estimated-ruleset`, NOT
`structured`. National detail: [`../../../sources/SOURCES.md`](../../../sources/SOURCES.md).

## A — VERIFIED (one row per value the pack sets)
| Field (pack key) | Value | Unit | Governing article | Document (title + date) | URL / handle | Confidence |
|---|---|---|---|---|---|---|
| `sa-villa.maxCoverage` | `0.75` | ratio | 2024 MOMRAH decision, Ch. 4 (p18) | قرار 1/4500943139, 1446 H | momah.gov.sa / balady.gov.sa | `published` |
| `sa-apartment.maxCoverage` | `0.65` | ratio | Ch. 4 (p22) | same | same | `published` |
| `setback.front` (resolved) | `max(w/5, 3)` | m | Ch. 4 §4.2 | same | same | `published` |
| `setback.side` / `setback.rear` (resolved) | `max(w/5, 2)` | m | Ch. 4 §4.2 | same | same | `published` |
| `permittedUse` (both) | `residential` | — | Ch. 3 (pp12–15) | same | same | `published` |

> `setback.*` is `null` in the shipped pack (the width-dependent template) and filled per-parcel by
> `saRiyadhResolvedPack()` with `ordinance-pdf` provenance — the resolved value IS an ordinance
> construction, so `ordinance-pdf`, never `published-structured`.

## B — UNVERIFIED / open (stays `null` in the pack)
| Field | Why not verified | What would verify it |
|---|---|---|
| `maxHeight_m` | Municipal plan (Ch. 4 §4.1) + development-authority override (Ch. 1 §1); reachable sources geo-fenced. | In-SA read of RCRC/ADA per-zone height table, or Balady data agreement. |
| `maxFloors` | Same. | Same (Balady `NOOFFLOORS`). |
| `plotRatioFAR` | Does not exist in the residential regime. | — (genuine absence). |
| clause NUMBERS for the above `published` rows | Read as page positions, not clause-transcribed. | Human clause transcription + `VERIFICATION.md` sign-off (L-449). |

⚠ Neighbour-side setback (1.5 villa / 2–3 apt, Ch. 4 §4.2) is a real value but is NOT in the
street-facing triple the pack resolves — recorded as a pack constant (`SA_NEIGHBOUR_SIDE_M`), applied
only when a party edge is classified. Not a shipped zone field.
