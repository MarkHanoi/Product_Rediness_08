# Netherlands — 3D Context Data (build-order #1, reference pattern)

Part of the country study — umbrella **L-511** (`../../V1-LAUNCH-READINESS-AUDIT.md`).
Research ground-truth: `Pryzm_3D_Context_Data_Sourcing.md`. **Spike run live 2026-07-21.**

- **Target LOD:** LOD2.2 (real roofs)
- **Source(s):** 3DBAG (buildings) · BGT (roads/pedestrian/water/green) · AHN4/5 (LiDAR)
- **Integration effort:** LOW — cleanest API of the 7; chosen as the pattern-proving reference
- **Spike status:** **BUILDINGS GATE PASSED (live-verified)** · BGT GATE **BLOCKED** (endpoint unreachable from spike env — re-verify)
- **Implementation status:** NOT STARTED (awaiting founder go-ahead per two-phase rule)

## Endpoint verification (live, 2026-07-21)
| Endpoint | Status | Notes (from the ACTUAL response) |
|---|---|---|
| `https://api.3dbag.nl/collections/pand` | **200 LIVE** | `storageCrs = EPSG:7415` (Amersfoort/RD New + NAP height); license link **CC BY 4.0**; `collection v2023.10.08`; `api 0.1` (beta); national extent bbox `[10000,306250,287760,623690]` (RD-New metres) |
| `…/collections/pand/items?bbox=…&bbox-crs=…EPSG/0/7415` | **200 LIVE** | Returns **CityJSONFeatures** (`CityObjects`: a `Building` + `-0` `BuildingPart`), selectable LOD 0 / 1.2 / 1.3 / 2.2 |
| `https://api.pdok.nl/lv/bgt/ogc/v1/collections` (BGT) | **HTTP 000** | Unreachable from this spike environment. **FLAGGED — not substituted.** Could be egress/DNS/TLS here, not necessarily dead. Re-verify from an env with open outbound before scoping BGT. |

## Sample pull — one real building, central Amsterdam (Dam square, RD-New bbox)
`NL.IMBAG.Pand.0363100012165687` — actual attributes returned:
- `b3_dak_type: "slanted"` (roof shape **classified**) · `b3_n_vlakken: 92` (92 roof/wall surfaces) · `b3_n_nok: 11` (ridge lines)
- Heights (m, NAP): `b3_h_maaiveld: 1.42` (ground) · `b3_h_dak_50p: 18.28` · `b3_h_dak_70p: 23.79` · `b3_h_dak_max: 33.375` · `b3_h_nok: 33.84` (ridge)
- Provenance: `b3_pw_bron: "ahn5"` · `b3_pw_datum: 2023` · `b3_pw_selectie_reden: "PREFERRED_AND_LATEST"`
- Quality: `b3_rmse_lod22: 0.615` (**sub-metre**) · `b3_val3dity_lod22: "[303,307]"` (self-reported geometry-validity codes — this building has minor issues) · `b3_rmse_lod13: 1.11`
- BAG attrs: `oorspronkelijkbouwjaar: 1981` · `status: "Pand in gebruik"` · valid-from `2023-09-28`
- Geometry is CityJSON `MultiSurface` boundaries indexing a shared vertices array (transform + vertices at feature level) — **real roof planes**, not an extruded block.

## Height/roof fidelity — 5-building spot check (Dam-square bbox)
| id (partial) | `b3_h_dak_max` (m) | `b3_dak_type` | year | plausibility (headless — needs oblique confirm) |
|---|---|---|---|---|
| …2165687 | 33.38 | slanted | 1981 | plausible large block |
| …2165129 | 37.51 | slanted | 1916 | plausible canal-district block |
| (sample) | 43.78 | — | — | plausible tall corner block |
| (sample) | 24.94 | — | — | plausible mid-rise |
| (sample) | 22.88 | — | — | plausible canal house |
Ground `b3_h_maaiveld` clusters ~1.3 m NAP across the sample (internally consistent). Range 21–44 m
matches central-Amsterdam massing. **Caveat:** I ran this headless — the satellite/Street-View oblique
confirmation for these 5 ids is the one manual step still owed before this row is signed.

## Gate — Phase-1 exit (evidence-backed)
| # | Question | Verdict | Evidence |
|---|---|---|---|
| a | Real footprint? | **YES** | BAG `pand` polygon per feature |
| b | Real height? | **YES** | AHN-LiDAR-derived percentile + max + ridge heights, sub-m RMSE |
| c | Real roof shape? | **YES** | LOD2.2 MultiSurface, `b3_dak_type` classified, 92 surfaces on sample |
| d | Roads/water/parks object-level? | **UNVERIFIED** | BGT endpoint returned HTTP 000 here — blocked, re-verify |
| e | Known coverage gaps? | Buildings: none material (national). BGT: unverified. Data vintage 2023 (AHN5). API is v0.1 **beta** → pin version, expect breaking changes. |

**Buildings Gate: PASSED. Full country Gate: HELD until BGT re-verified.**

## Integration facts for Phase 2 (do not lose these)
1. **Reproject.** 3DBAG storage CRS is **EPSG:7415 (RD New + NAP)** — our pipeline is WGS84. The
   adapter MUST reproject RD-New→WGS84 (and NAP heights are a datum offset vs our ground zero — reuse
   the globe ground-anchor lessons from L-477/479, do not assume NAP == our ground zero).
2. **CityJSON, not glTF-by-default via this API.** Parse CityJSONFeatures → internal mesh; or use
   3DBAG's separate 3D Tiles (glTF, EPSG:4978) export for a globe-ready path — evaluate both.
3. **Pin the API version** (`v0.1` beta) and the collection vintage (`v2023.10.08`).
4. **License = CC BY 4.0** → attribution obligation surfaces in the data-source disclosure panel.
5. Fall through to the OSM/Overture path cleanly when a bbox returns no features.
