# Switzerland — regions

Switzerland is uniquely close to a single national product for most layers. Three regional dimensions
exist and are documented here: (1) swissBUILDINGS3D 3.0 Beta partial canton rollout, (2) ÖREB/RDPPF
canton endpoints (ALL cantons have endpoints — fully national at the API level), and (3) the national
Nutzungsplanung WFS (19+ cantons, partial).

---

## 1 — swissBUILDINGS3D 3.0 Beta — building geometry routing

The only real routing split for context data. Route by project bbox → canton intersection.

### Live in 3.0 Beta (EGID baked into model)

| ISO 3166-2 | Canton | Endpoint / notes |
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
| `ch-zh` | Zürich | ⚠️ **City of Zürich only** — rest of canton uses 2.0 fallback |

Note — CityGML 2.0 format was available for a subset of the above as of August 2024 (AG, AI, AR, BE,
BL, BS, GL, JU, TG + city of ZH). FR, LU, NE, NW, OW, SG, SH, SO, SZ, UR were added to 3.0 Beta
between Aug 2024 and July 2026 but their CityGML availability has not been separately confirmed.

### Not yet live in 3.0 Beta (use swissBUILDINGS3D 2.0 + GWR coordinate join)

| ISO 3166-2 | Canton | ÖREB endpoint | Notes |
|---|---|---|---|
| `ch-ge` | Geneva / Genève | `ge.ch/terecadastrews/RdppfSVC.svc` ✅ | 2.0 fallback; parcels fully covered at LOD2; ÖREB LIVE |
| `ch-vd` | Vaud (incl. Lausanne) | `rdppf.vd.ch/ws/RdppfSVC.svc/` ✅ | 2.0 fallback; ÖREB LIVE |
| `ch-vs` | Valais / Wallis | `rdppf.apps.vs.ch` | 2.0 fallback |
| `ch-ti` | Ticino / Tessin | `crdpp.geo.ti.ch/oereb2` | 2.0 fallback |
| `ch-zg` | Zug | `oereb.zg.ch/ors` | 2.0 fallback |
| `ch-gr` | Graubünden / Grischun | `oereb.geo.gr.ch/oereb` | 2.0 fallback |
| `ch-zh` (outside city) | Canton Zürich (outside city) | `maps.zh.ch/oereb/v2` ✅ | 2.0 fallback for non-city parcels |

**This is a fidelity/convenience gap, not availability.** Geneva and Lausanne are fully covered at
LOD2 via swissBUILDINGS3D 2.0. EGID can be joined via GWR coordinate match.

⚠ **Re-check cadence:** every 6 months at `opendata.swiss/en/dataset/swissbuildings3d-3-0-beta`.

### Routing logic

```
project_bbox → canton intersection check
  → canton in 3.0 Beta live list? → swissBUILDINGS3D 3.0 Beta (EGID in model)
  → canton NOT yet in 3.0 Beta?  → swissBUILDINGS3D 2.0 + GWR coordinate EGID join
```

---

## 2 — ÖREB/RDPPF endpoints — ALL 26 cantons (no routing split needed at this level)

Unlike swissBUILDINGS3D, ÖREB is fully national at the API level — every canton has an endpoint.
The canton-specific routing is by destination endpoint URL, all using the same V-ÖREB protocol:

```
project_bbox → canton → ${canton_endpoint}/getegrid/json/?EN=${E},${N} → EGRID
→ ${canton_endpoint}/extract/json/?EGRID=${EGRID} → restriction data
```

Full endpoint list: see `../sources/SOURCES.md §A — Legal/zoning layer — ÖREB/RDPPF endpoints`.

Key format notes:
- AG, ZH, SH, GL, SZ, TG, LU, SO, SG, AR, AI, BL, GR, JU, NW, OW, UR, ZG: REST/JSON (standard V-ÖREB)
- GE, VD, FR: WCF SOAP services (Microsoft WCF format, require SOAP client not HTTP GET)
- BS: REST at `api.oereb.bs.ch`
- BE: REST at `oereb2.apps.be.ch`
- VS: REST at `rdppf.apps.vs.ch`
- NE: no public URL confirmed — email sitn@ne.ch

---

## 3 — Nutzungsplanung WFS (geodienste.ch) — partial canton coverage

Available at `https://geodienste.ch/db/npl_nutzungsplanung_v1_2_0/deu` — single endpoint,
canton-filtered query.

| Coverage | Cantons |
|---|---|
| **Full** | AG, AI, AR, BL, BS, FR, GE, JU, LU, NE, NW, OW, SG, SH, SZ, TG, UR, VD, ZG |
| **Incomplete** | BE, GR, SO, VS |
| **No data** | FL (Liechtenstein) |
| **Not listed** | ZH (uses its own cantonal WFS via geolion.zh.ch) |

⚠ Fees may apply — "Die Gebühren werden durch die Kantone erhoben." Confirm with geodienste.ch before
production ingestion. Access is geo-restricted to DACH region (D-A-CH-Li) for GetFeature calls.

Layer names:
- `ms:grundnutzung` — basic land use zones (zone polygons)
- `ms:ueberlagernde_nutzungsplaninhalte_flaechenbezogene_festlegungen` — area overlays
- `ms:ueberlagernde_nutzungsplaninhalte_linienbezogene_festlegungen` — line overlays
- `ms:ueberlagernde_nutzungsplaninhalte_punktbezogene_festlegungen` — point overlays

---

## 4 — Layers with no routing (full national, single endpoint)

| Dataset | Split? |
|---|---|
| swissTLM3D (roads, water, parks, trees) | None — single national download/API |
| swissSURFACE3D (classified LiDAR) | None — single national product |
| swissSURFACE3D Raster (DSM 0.5m) | None |
| swissALTI3D (DTM 0.5m/2m) | None |
| GWR (BFS, EGID-linked register) | None — `madd.bfs.admin.ch` federal API; canton mirrors for ZH/TG/GL/SZ |
| swisstopo WMS (`wms.geo.admin.ch`) | None — federal BGDI service |

---

*Last updated: 2026-07-24. 3.0 Beta canton list confirmed from opendata.swiss. ÖREB endpoint list
from federal M2M page (2026-02-13). geodienste.ch WFS GetCapabilities verified live. GE + VD RDPPF
verified live (SOAP). Source: `../sources/SOURCES.md`.*
