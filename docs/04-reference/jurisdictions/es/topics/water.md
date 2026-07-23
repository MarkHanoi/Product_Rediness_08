# Spain — Water (context layer)

> Umbrella **L-511**, deep-dive **L-512**. Free under Orden FOM/2807/2015.

- **BTN25 hydrography theme** (IGN) — authoritative bank lines, natural-vs-artificial classification.
- **IGR Hidrografia** (Informacion Geografica de Referencia — Hidrografia) — adds **Pfafstetter**
  river-basin classification codes + basin/sub-basin polygons (MITECO) at 100 m/25 m grid, on top of
  raw geometry. Useful if catchment/flood-adjacent context layers are ever wanted.
- Access: WFS / ATOM / CNIG download center (IGN host live-probed 200, 2026-07-21).

Genuine upgrade over OSM: authoritative banks + correct natural/artificial classification + basin
context. Lower priority than buildings/roads (OSM water is already close to sufficient) — badge
REAL — IGN BTN25/IGR where wired, else OSM ESTIMATED.

## Gate
| Q | Verdict |
|---|---|
| Object-level polygons/lines? | **YES** (BTN25 + IGR Hidrografia) |
| License | Free/open (FOM/2807/2015) |
| Fallback | OSM (already near-sufficient for water) |

---

## 3D modeling method — WATER (the one layer where you do NOT reuse nDSM) (L-512)
LiDAR NIR interacts poorly with water (absorbed / specularly reflected away) -> returns over open water
are sparse/noisy/missing. **Do NOT derive water surfaces from raw LiDAR elevation** (jittery, wrong).
Flatten to authoritative reference elevations instead:
```
1. Shape from BTN25 / IGR Hidrografia polygon (lake) or line (river) — NOT from LiDAR.
2. Lake/reservoir: sample DTM (not raw points) at shore/inflow -> robust LOW-percentile elevation ->
   assign that single flat elevation to the whole polygon (lakes are flat for rendering).
3. River: has a longitudinal gradient but is flat across width -> sample DTM along centerline at
   intervals, interpolate a smooth gradient; still ignore raw points over the water surface.
4. Sea/coast: fixed mean-sea-level reference plane (ES vertical datum is MSL-referenced) — the
   shoreline is a tidal boundary, not a per-tile terrain feature.
```
Note PNOA recent specs include an explicit **water class** in the point cloud — useful for masking, not
for surface elevation. This is a case where "more raw data" is the WRONG input.
