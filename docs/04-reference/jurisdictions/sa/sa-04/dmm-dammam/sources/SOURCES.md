# Dammam (`sa-dmm-dammam`) — per-field sources

**Status:** SCAFFOLD. The national footprint fields are `published` (primary decision, clause-transcribed
L-606 — identical to Riyadh); the Dammam-local layer (Amanat Eastern Province) is `CONVERGENT-SECONDARY`. No
pack authored for Dammam; the city-agnostic footprint pack would be reused. The `structured`-tier gate is the
human `VERIFICATION.md` sign-off → until signed the footprint ships `estimated-ruleset`. National detail:
[`../../../sources/SOURCES.md`](../../../sources/SOURCES.md).

> **Trust gate:** a field with NO citable source stays `null` in the pack. A pack may not ship confidence
> `structured` unless EVERY field it sets has a row in §A here.

## A — VERIFIED (national footprint fields — identical to Riyadh) — clause-cited
| Field (pack key) | Value | Unit | Governing clause | Document (title + date) | URL / handle | Confidence |
|---|---|---|---|---|---|---|
| `sa-villa.maxCoverage` | `0.75` | ratio | **§4-1 cl. 1** | اشتراطات إنشاء المباني السكنية, قرار 1/4500943139, 1446 H (≈21 Jul 2024) | momah.gov.sa / balady.gov.sa | `published` |
| `sa-apartment.maxCoverage` | `0.65` | ratio | **§4-2 cl. 1** | same | same | `published` |
| `setback.front` (resolved) | `max(w/5, 3)` | m | **§4-1 cl. 4 / §4-2 cl. 4** (≥6 m at w≥30 m §4-1 cl. 5) | same | same | `published` |
| `setback.side` / `setback.rear` (resolved) | `max(w/5, 2)` | m | **§4-1 cl. 4 / §4-2 cl. 4** | same | same | `published` |
| `permittedUse` (both) | `residential` | — | **§3-1 / §3-2** | same | same | `published` |
| `SA_MAX_HEIGHT_M.villa` (ceiling, not rendered) | `≤ 14` | m | **§5-1-5 cl. 3** (+ §3-1 ≤ G+1+annex) | same | same | `published` |
| `SA_MAX_HEIGHT_M.apartment` (ceiling, not rendered) | `≤ 23` | m | **§3-2** (+ §2 high-rise def, §1-1) | same | same | `published` |

> The footprint is **byte-identical to Riyadh** — Section 4 binds all Amanas, so Amanat Eastern Province sits
> on the same national footprint. `setback.*` is `null` in the shipped pack and filled per-parcel by the
> resolver with `ordinance-pdf` provenance.

## B — UNVERIFIED / open (stays `null` in the pack)
| Field | Why not verified | What would verify it |
|---|---|---|
| `maxHeight_m` / `maxFloors` — the **EXACT** value | National CEILING cited in §A; exact value municipal (Amanat Eastern Province §4 cl. 1) + any dev-authority override (§1 cl. 3); reachable sources geo-fenced | In-SA read of the Amanat Eastern Province per-zone height table, or a Balady data agreement (`NOOFFLOORS`) |
| Amanat Eastern Province numeric code (municipal id) | UN/LOCODE `DMM` used as the path segment; no open MOMRAH Amana numeric code verified | Confirm an open, stable Amanat Eastern Province code if MOMRAH publishes one |
| `plotRatioFAR` | Does not exist in the residential regime (0 hits) | — (genuine absence) |
| Live parcel geometry / classification | Balady `MapServer/28` geo-fenced (national) | In-SA egress or MOMRAH/Balady data agreement |
| Eastern-Province development-authority zones | Not enumerated this pass | Confirm whether any EP dev-authority zone overrides the vertical (§1 cl. 3) |

## C — LOCAL CONTEXT (secondary — not a pack field, recorded for provenance)
| Item | Source | Tier | Note |
|---|---|---|---|
| Amanat Eastern Province | MOMRAH branch directory (momah.gov.sa/en/branches-secretariat) | `CONVERGENT-SECONDARY` | approved-plan holder; not probed live |
| Context buildings / terrain | Microsoft Global ML Building Footprints; Copernicus DEM GLO-30 | `published` | global fallbacks — see `../../../topics/buildings-lod-height.md` |

⚠ No UNESCO-scale heritage overlay identified for Dammam — the cleanest of the three cities (contrast Jeddah's
Al-Balad). Neighbour-waiver mechanic — appears only in secondary sources, NOT the primary decision. Research
note, never a shippable field.
