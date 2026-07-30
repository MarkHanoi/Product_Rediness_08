# HEIGHT — Paris (INSEE 75056)

> Building-height provenance status (`BUILDING-HEIGHT-REPLICATION-STANDARD.md`, L-646; feeds C63 Axis 6). **Last updated:** 2026-07-30. **Maintainer:** UNASSIGNED.

## Axis 6 (HEIGHTS/LOD): `not-assessed` (`not-queried`) — measured-**CAPABLE**

**Source is wired and live-verified, but the per-city bake has NOT landed.** IGN **BD TOPO®**
`batiment.hauteur` (photogrammetry/LiDAR metres) is implemented and live in `heightSources.mjs`
(`bdtopo`, impl:`live`; `fetchBdTopo` WFS 2.0 → GeoJSON EPSG:4326), and `REGION_SOURCE` maps
`paris:'bdtopo'`. Live-verified 5/5 non-null in Paris 8e (probe bbox `[2.346,48.852,2.352,48.858]`,
values 9.5–21 m, "LOD-RATE-verified").

**Why still `not-assessed`:** the BD TOPO batiment WFS is **single-shot** (`startIndex` ignored) and caps
at `limit`, while the Paris bake bbox holds **~317,361 buildings** — a naïve bake would delete ~98 % of
Paris (§BDTOPO-CAP-TRUNCATE, live-measured 2026-07-27). No per-building `heightProvenance` histogram has
been probed for the deployed tiles. Capability is never reported as a measurement (§CONTEXT-DATA-HONESTY).

**Resume:** implement the paginated / BD-TOPO→OSM-footprint-join bake for the Paris bbox (the named
follow-up in `heightSources.mjs`), re-bake, then probe the deployed provenance histogram to compute the
`tagged` fraction. A fabricated height is never emitted.

*Cross-refs: `BUILDING-HEIGHT-REPLICATION-STANDARD.md`, `heightSources.mjs` (`bdtopo`, §BDTOPO-CAP-TRUNCATE), C63 §3 Axis 6.*
