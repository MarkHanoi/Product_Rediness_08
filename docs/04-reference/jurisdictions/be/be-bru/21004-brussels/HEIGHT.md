# HEIGHT — Brussels (NIS 21004)

> Building-height provenance status (`BUILDING-HEIGHT-REPLICATION-STANDARD.md`, L-646; feeds C63 Axis 6). **Last updated:** 2026-07-30. **Maintainer:** UNASSIGNED.

## Axis 6 (HEIGHTS/LOD): `not-assessed` (`adapter-limitation`) — NOT measured-capable today

**No wired, live building-height source resolves for Brussels.** `heightSources.mjs`
`REGION_SOURCE.brussels` maps to `grb_be` with status **`blocked`**:

> `{ source: 'grb_be', status: 'blocked', reason: 'Brussels UrbIS height attribute unprobed; GRB height is Flanders-only' }`

- The `grb_be` source ("3D GRB LoD1 DHMV" — LiDAR ridge height) has `impl: 'documented'` and, per its own
  note, "Height structured **ONLY in Flanders**. Brussels (UrbIS) / Wallonia (PICC) height UNKNOWN →
  blocked-until-probed. Three separate schemas, no shared model." So GRB does **not** cover Brussels-Capital.
- Brussels' own base map (**UrbIS**, `geoservices-urbis.irisnet.be`) is confirmed as a reference dataset but
  its building layer's height attribute is **unprobed**, and no standalone Brussels LiDAR programme is
  identified (`../../README.md §2.4`).

**Contrast with Amsterdam:** NL's 3DBAG gives real measured roof heights and is `impl: 'live'` — Brussels has
no equivalent wired source, so its buildings render at the OSM `assumed` default (9 m carpet) in the baked
`brussels` context tiles. A fabricated height is never emitted (§CONTEXT-DATA-HONESTY).

**Highest-value probe / resume:** one `GetFeature` against the already-verified **federal CADMAP** building
sublayer ("buildings managed by AGDP") to check for a height/storey attribute — if positive, it would be a
free, nationally-consistent Belgian building-height source unlike anything in the three regional systems
(`../../README.md §7`). Otherwise probe the UrbIS building layer schema for a height field.

*Cross-refs: `BUILDING-HEIGHT-REPLICATION-STANDARD.md`, `heightSources.mjs` (`grb_be`, `REGION_SOURCE.brussels`), C63 §3 Axis 6, `../../README.md §2.4`.*
