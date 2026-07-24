# Switzerland — regions

Switzerland is uniquely close to a single national product for the context-data layer. Almost
everything is one federal agency (swisstopo / BFS), one licence, one download path. The **one real
regional split** is the swissBUILDINGS3D 3.0 Beta canton rollout, documented below. Everything else is
full-national.

---

## 1 — swissBUILDINGS3D 3.0 Beta — the one confirmed regional split

The enhanced, EGID-linked building product (3.0 Beta) is confirmed live only in a subset of cantons.
Route by project bbox → check which canton(s) intersect → serve 3.0 Beta or 2.0 fallback accordingly.

### Live in 3.0 Beta (EGID baked into the model)

| ISO 3166-2 | Canton | Notes |
|---|---|---|
| `ch-ag` | Aargau | ✅ |
| `ch-ai` | Appenzell Innerrhoden | ✅ |
| `ch-ar` | Appenzell Ausserrhoden | ✅ |
| `ch-be` | Bern | ✅ |
| `ch-bl` | Basel-Landschaft | ✅ |
| `ch-bs` | Basel-Stadt | ✅ |
| `ch-fr` | Fribourg / Freiburg | ✅ |
| `ch-gl` | Glarus | ✅ |
| `ch-ju` | Jura | ✅ |
| `ch-lu` | Lucerne / Luzern | ✅ |
| `ch-ne` | Neuchâtel | ✅ |
| `ch-nw` | Nidwalden | ✅ |
| `ch-ow` | Obwalden | ✅ |
| `ch-sg` | St. Gallen | ✅ |
| `ch-sh` | Schaffhausen | ✅ |
| `ch-so` | Solothurn | ✅ |
| `ch-sz` | Schwyz | ✅ |
| `ch-tg` | Thurgau | ✅ |
| `ch-ur` | Uri | ✅ |
| `ch-zh` | Zürich | ⚠️ **City of Zürich only** — rest of the canton uses 2.0 fallback |

### Not yet live in 3.0 Beta (use swissBUILDINGS3D 2.0 + GWR coordinate join)

| ISO 3166-2 | Canton | Notes |
|---|---|---|
| `ch-ge` | Geneva / Genève | ❌ — 2.0 fallback; parcels fully covered at LOD2 |
| `ch-vd` | Vaud (incl. Lausanne) | ❌ — 2.0 fallback; parcels fully covered at LOD2 |
| `ch-vs` | Valais / Wallis | ❌ — 2.0 fallback |
| `ch-ti` | Ticino / Tessin | ❌ — 2.0 fallback |
| `ch-zg` | Zug | ❌ — 2.0 fallback |
| `ch-gr` | Graubünden / Grischun / Grigioni | ❌ — 2.0 fallback |

> **This is a fidelity/convenience gap, not a data-availability gap.** Geneva and Lausanne parcels are
> fully covered at LOD2 via swissBUILDINGS3D 2.0. The only difference is that EGID is not baked
> directly into the model — it can still be joined externally via GWR coordinate match.

---

## 2 — Everything else: full-national, no regional split required

| Dataset | Regional split? |
|---|---|
| **swissTLM3D** (roads, water, parks, trees) | None — one national product, one licence |
| **swissSURFACE3D** (classified LiDAR point cloud) | None — full national coverage (7-stage survey completed 2017–2024/25) |
| **swissSURFACE3D Raster** (DSM 0.5m) | None — full national by 2025 |
| **swissALTI3D** (DTM 0.5m/2m) | None — full national |
| **GWR** (Gebäude- und Wohnungsregister, BFS) | None — one federal register, EGID-linked, ≤48h update nationally |

---

## 3 — Routing logic for implementation

```
project_bbox → which canton(s) intersect?
  → canton in 3.0 Beta live list? → serve swissBUILDINGS3D 3.0 Beta (EGID in model)
  → canton not yet in 3.0 Beta?  → serve swissBUILDINGS3D 2.0 + GWR EGID join
```

All other layers (swissTLM3D, swissSURFACE3D, swissALTI3D, GWR): single national endpoint, no routing needed.

---

## 4 — Standing action item

Re-run the 3.0 Beta canton-coverage check every **6 months** (matching its biannual update cycle).
Check directly against `opendata.swiss/en/dataset/swissbuildings3d-3-0-beta` — do not treat the
2026-07-24 list as static. Additional cantons (GE, VD, VS, TI, ZG, GR, or canton ZH outside the city)
may have been added since this pass.

---

*Last updated: 2026-07-24. Source: `coverage-gaps_1784895334354.md` research pass.*
