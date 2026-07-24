# Jeddah (`sa-jed-jeddah`) — per-field sources

**Status:** SCAFFOLD. The national footprint fields are `published` (primary decision, clause-transcribed
L-606 — identical to Riyadh); the Jeddah-local layers (Amana, development authority, Al-Balad) are
`CONVERGENT-SECONDARY` / `geo-fenced`. No pack authored for Jeddah; the city-agnostic footprint pack would be
reused. The `structured`-tier gate is the human `VERIFICATION.md` sign-off → until signed the footprint ships
`estimated-ruleset`. National detail: [`../../../sources/SOURCES.md`](../../../sources/SOURCES.md).

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

> The footprint is **byte-identical to Riyadh** — Section 4 binds all Amanas, so Amanat Jeddah sits on the
> same national footprint. `setback.*` is `null` in the shipped pack and filled per-parcel by the resolver
> with `ordinance-pdf` provenance.

## B — UNVERIFIED / open (stays `null` in the pack)
| Field | Why not verified | What would verify it |
|---|---|---|
| `maxHeight_m` / `maxFloors` — the **EXACT** value | National CEILING cited in §A; exact value municipal (Amanat Jeddah §4 cl. 1) + Jeddah Development Authority override (§1 cl. 3); reachable sources geo-fenced | In-SA read of the Amanat Jeddah / Jeddah Development Authority per-zone height table, or a Balady data agreement (`NOOFFLOORS`) |
| Al-Balad heritage overlay (property + buffer) | UNESCO WHC inscription boundary is public (2014); the JHD 651-building GIS is not confirmed open; not wired as a shippable overlay | Fetch the public UNESCO WHC "Historic Jeddah" boundary as a refuse/flag overlay; JHD data agreement for the building-level regime |
| Amanat Jeddah numeric code (municipal id) | UN/LOCODE `JED` used as the path segment; no open MOMRAH Amana numeric code verified | Confirm an open, stable Amanat Jeddah code if MOMRAH publishes one |
| `plotRatioFAR` | Does not exist in the residential regime (0 hits) | — (genuine absence) |
| Live parcel geometry / classification | Balady `MapServer/28` geo-fenced (national) | In-SA egress or MOMRAH/Balady data agreement |

## C — LOCAL CONTEXT (secondary — not a pack field, recorded for provenance)
| Item | Source | Tier | Note |
|---|---|---|---|
| Amanat Jeddah / permit system | Etmam (`etmam.momrah.gov.sa`); Jeddah Municipality (momah.gov.sa/en/branches/jeddah-municipality) | `CONVERGENT-SECONDARY` | approved-plan holder; not probed live |
| Jeddah Development Authority | Cabinet approval Sept 2023 (Argaam / press) | `CONVERGENT-SECONDARY` | §1 cl. 3 override; not a per-parcel feed |
| Al-Balad — Historic Jeddah | UNESCO WHC (inscribed 2014); Jeddah Historic District Program (Ministry of Culture), 651 buildings assessed 2021–22 | `VERIFIED-PRIMARY` (inscription); `CONVERGENT-SECONDARY` (GIS) | conservation overlay; boundary public, detailed GIS not open |
| Context buildings / terrain | Microsoft Global ML Building Footprints; Copernicus DEM GLO-30 | `published` | global fallbacks — see `../../../topics/buildings-lod-height.md` |

⚠ Neighbour-waiver mechanic — appears only in secondary sources, NOT the primary decision. Research note,
never a shippable field.
