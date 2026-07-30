<!-- CITY HEIGHT.md (C63 §5 — feeds the HEIGHTS/LOD axis). Copy into the dossier, replace <PLACEHOLDER>s,
     delete this comment. Standard: BUILDING-HEIGHT-REPLICATION-STANDARD.md (L-646). -->
# Building-height status — <PLACE> (<code>)

> Feeds C63 **HEIGHTS/LOD** axis. The score is the **`tagged` fraction** of the baked PMTiles
> `heightProvenance` histogram at the city bbox (C63 §3 Axis 6) — COMPUTED, never hand-typed. A fabricated
> default height rendered as real is the §CONTEXT-DATA-HONESTY failure (L-646/L-459). Each building carries a
> C62 `DomainConfidence`; `assumed`/`derived-levels` render distinctly (L-647).

## Height source ladder (which rung this city sits on)
| Rung | Source | Provenance tag | Present here? |
|---|---|---|---|
| measured | LiDAR nDSM (DSM−DTM) / national 3D product | `tagged` | `<yes/no — endpoint>` |
| measured | OSM `height` | `tagged` | `<coverage %>` |
| derived | OSM `building:levels` × floor-height | `derived-levels` | `<…>` |
| ordinance | `alçada reguladora` / street-width rule | `derived` | `<… or the L-525 gap>` |
| fallback | the 9 m carpet | `assumed` | ⚠ never authoritative |

## Provenance distribution (the axis input)
`tagged <N%> · derived-levels <N%> · assumed <N%>` — from the bake stamp / context-panel histogram. `<date>`.

## What would raise the HEIGHTS/LOD axis
`<the national nDSM / 3D-product to wire · effort>` — cross-ref `GEO-DATA-SOURCING-MASTER.md` + `LOD-RATE.md`.

---
*Authority: `BUILDING-HEIGHT-REPLICATION-STANDARD.md` (L-646) · C62 · C63 §3 Axis 6. Feeds: `RATE.md` · `LOD-RATE.md`.*
