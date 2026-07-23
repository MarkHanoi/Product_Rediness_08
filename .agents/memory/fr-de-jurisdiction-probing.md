---
name: France/Germany jurisdiction probing
description: Key API findings, working endpoints, and dead ends from live-probing France and Germany jurisdiction data sources for building rules/heights (sessions 2026-07-23).
---

## GPU WFS — two endpoints, different purposes

- **GetCapabilities only**: `data.geopf.fr/annexes/ressources/wfs/gpu.xml?SERVICE=WFS&REQUEST=GetCapabilities&apikey=gpu`
- **GetFeature (actual data)**: `data.geopf.fr/wfs?SERVICE=WFS&VERSION=2.0.0&REQUEST=GetFeature&TYPENAMES=wfs_du:zone_urba&BBOX=...&OUTPUTFORMAT=application/json&apikey=gpu`
- `annexes/gpu.xml` returns GetCapabilities XML even when a GetFeature request is sent — do NOT use it for data retrieval.

**Why:** Discovered after repeated GetFeature attempts against gpu.xml returned Capabilities XML. Main `data.geopf.fr/wfs` endpoint works correctly.

**How to apply:** Always use `data.geopf.fr/wfs` for GetFeature; use `gpu.xml` only for Capabilities.

---

## apicarto.ign.fr working GPU paths (as of 2026-07-23)

- ✅ `GET /api/gpu/municipality?insee=<code>` — municipality boundary
- ✅ `POST /api/gpu/zone-urba` body `{"geom":{"type":"Point","coordinates":[lon,lat]}}` — zone_urba feature (full schema incl. libelle, libelong, urlfic, idurba, partition)
- ✅ `POST /api/gpu/document` body with geom — returns partition ID + DU grid info (NOT idurba/urlfic — use zone-urba for those)
- ❌ `GET /api/gpu/zone` — 404
- ❌ `GET /api/gpu/commune` — 404

**Why:** apicarto redesigned its GPU module; old paths removed.

---

## Marseille PLUi Territoire 1 — GPU findings

- Partition: `DU_200054807_A`; idurba: `200054807_PLUI_20260310_A`; datvalid: 20191219
- Règlement PDF URL pattern: `https://plui.ampmetropole.fr/assets/documents/PLUi_CT1_L_Reglement.pdf#page=N`
- Zone examples: UAe4 (centre-ville Marseille, p.80), UEc2 (activités mixité économique, p.248), UQG (défense nationale, p.328), UEsN1 (ports plaisance, p.274)
- NO height attributes in zone_urba schema — height is in graphic règlement only

---

## Lyon grandlyon.com pluzone layer — critical negative

- `pluzone` layer has the right field names (`hauteur_bande_principale`, `hauteur_bande_secondaire`, `plafond`, `ces`) but **ALL are NULL** across 10 diverse zone types sampled (UEi2, URm1, UL, UPr, UCe2a, UEi1, USP, N2).
- `pluzone` provides zone codes via `zonage` field only — not numeric height values.
- `pluhauteur` layer is the correct source for absolute height values.

---

## Paris plub_filet — haut letter codes confirmed

- Full set observed: **M, K, C, B, G** (likely more exist)
- `c_asp` format: `<arrondissement>-<section>-<parcel>` (e.g. "15-AI-0058")
- `cour` field: X = exterior, C = courtyard

---

## BayBO Art. 6 Abstandsflächen formula (confirmed 2026-07-23)

- H = wall height to wall/roof junction; roof ≤70° adds H/3; >70° adds full H
- Setback = **0.4H** (general), **0.2H** in Gewerbe/Industriegebieten (GE/GI zones), minimum **3m** always
- Source: `gesetze-bayern.de/Content/Document/BayBO-6` — full text accessible via curl
- HBauO §6 (Hamburg) and BauO Bln §6 (Berlin) — JS SPA portals, NOT accessible via curl

---

## Hamburg WFS status (2026-07-23)

- `geodienste.hamburg.de/HH_WFS_Bebauungsplaene` — ✅ HTTP 200, open, Datenlizenz Deutschland 2.0
- `geodienste.hamburg.de/HH_WFS_ALKIS` — ❌ HTTP 404 confirmed
- B-Plan WFS: plan boundary + PDF link ONLY — no GRZ/GFZ/Höhe attributes

---

## Berlin B-Plan WFS — CONFIRMED LIVE (2026-07-23)

- **Endpoint**: `https://gdi.berlin.de/services/wfs/bplan`
- **GetCapabilities**: `?SERVICE=WFS&VERSION=2.0.0&REQUEST=GetCapabilities` → HTTP 200
- **Licence**: Datenlizenz Deutschland - Zero - Version 2.0 (completely free, no restrictions)
- **Feature types**: `bplan:b_bp_fs` (festgesetzt), `bplan:a_bp_iv` (im Verfahren), `bplan:c_bp_ak` (außer Kraft)
- **Schema (b_bp_fs)**: planid, planname, planartname, verfahrensart, bereich, bezirk, bp_rechtsstand, festsg_am, `scan_www` (PDF URL: `https://mitte.gis-broker.de/bplaene/<planid>.pdf`), inhalt — **NO GRZ/GFZ/Höhe**
- **Same situation as Hamburg**: plan boundary + PDF link only; PDF transcription required
- Baunutzungsplan 1958/60 NOT in this WFS — still needs separate discovery
- FIS-Broker `/fb/` paths all 404 (dead); `gdi.berlin.de/services/wfs/be_xplanung` → 404

---

## Munich WFS — all known endpoints blocked (2026-07-23)

- `geoportal.muenchen.de/geoserver/wfs` → 404
- `geoportal.muenchen.de/geoserver/opendata/wfs` → 404
- `stadtplan.muenchen.de/stadtplan/ows` → connection refused
- `geoservices.bayern.de/wfs/bplan` → 404
- Munich opendata CKAN → 1 result, CSW only, no WFS
- Next tries: `mapserver.gis.muenchen.de`, `geoportal.bayern.de/bayernatlas` WFS endpoint

---

## DiPlanung operational scope (2026-07-23)

- Already live in 7 Länder: Bayern, Berlin, Brandenburg, Bremen, Hamburg, Niedersachsen, Schleswig-Holstein
- NOT future-only; Bavarian mandate formalises from Oct 2026 but service already runs
- Fachliche Leitstelle: Hamburg BSW
- API endpoint URL at `diplanung.de/schnittstellen` — not yet fetched
