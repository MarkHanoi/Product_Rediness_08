// ─────────────────────────────────────────────────────────────────────────────
// §DE-LOD2-LAENDER (2026-09-05, lane HEIGHTS-DE-LAENDER) — the per-Land LoD2-DE ROUTER: the PURE,
// dependency-free half of the German national measured-height stamp.
//
// WHY THIS FILE IS SEPARATE FROM heightSources.mjs — the same reason as heights/mnhFr.mjs, swissNdsm.mjs
// and nl3dbag.mjs: vitest cannot import heightSources.mjs, so every DECISION the stamp makes (which Land
// serves a footprint, the tile key + URL for a point, how a CityGML block becomes parts, how a zip is
// walked, the city working set) lives here as a total function of its arguments and is unit-tested
// against VERBATIM live fixtures; the network + stream half (heights/deLod2LaenderStamp.mjs) imports these.
//
// THE PROBLEM THIS ROUTER SOLVES. LoD2-DE is ONE AdV product (CityGML, `bldg:measuredHeight` per building,
// standardised roof codes, ETRS89/UTM) published SIXTEEN different ways — one per Land, each with its own
// host, tile grid, container, naming and licence. NRW was wired 2026-07-31 (heightSources.mjs
// stampLod2NrwHeightsOnGeojsonseq, the koln city row); every other Land rendered assumed 9 m defaults
// because bake.mjs's `germany` row carried no join. The stamp itself does not change per Land — the
// GML is the same schema everywhere (verified on every wired Land below: `urn:adv:crs:ETRS89_UTM3x*
// DE_DHHN2016_NH`, srsDimension 3, GroundSurface posList, measuredHeight) — only the DOOR does. So the
// router is a table of doors and the stamp is one function.
//
// EVERY ROW BELOW IS A PROBE, NOT A READING (all on 2026-09-05, curl ≤ 20 s + node fetch, see the
// per-row `probe` text). A Land is `wired` only where a KEYLESS tile was fetched and its GML shape
// verified; `blocked` where a real barrier answered (403/503/NoSuchKey/login); `unprobed` where the
// door was not found inside this lane's budget; `probed-open-unarmed` for Bavaria (open, but the brief
// keeps Munich blocked — a founder decision, recorded, not silently overridden).
//   • bb  Brandenburg — https://data.geobasis-bb.de/geobasis/daten/3d_gebaeude/lod2_gml/ is an Apache
//         listing of 19,298 × `lod2_33<E>-<N>.zip` (1 km, EPSG:25833). lod2_33368-5807.zip (Potsdam)
//         → HTTP 200, 2,890,413 B, Accept-Ranges; entries `lod2_33368-5807_geb.gml` (deflate, 23.8 MB)
//         + `_meta.html`. GML: 767 bldg:Building, 1,620 measuredHeight (BuildingParts carry their own),
//         3,202 GroundSurface, srs ETRS89_UTM33*DE_DHHN2016_NH, roofType 1000/3100/5000/3500/9999/2100.
//         Licence page (3d_gebaeude/): "Datenlizenz Deutschland Namensnennung 2.0" (dl-de/by-2-0).
//   • hh  Hamburg — ONE archive: https://daten-hamburg.de/opendata/3d_stadtmodell_lod2/LoD2-DE_HH_2025-03-14.zip
//         → HTTP 200, 656,326,904 B, Accept-Ranges: bytes; central directory 782 entries (83,674 B at
//         offset 656,243,208), each `LoD2_32_<E>_<N>_1_HH.xml` (1 km, EPSG:25832, deflate; p50 6.5 MB,
//         max 28.1 MB uncompressed). LoD2_32_566_5934_1_HH.xml (Rathaus) range-read 1,668,392 B →
//         547 Buildings / 547 measuredHeight / 1,094 GroundSurface / no BuildingPart. Transparenzportal
//         package: license_id "dl-de-by-2.0". (The 3D Tiles tileset.json is NOT used — b3dm, no attrs.)
//   • sh  Schleswig-Holstein — gaialight `massen.php?file=LoD2_32_<E>_<N>_1_SH.xml&id=4&live=2024&km=32<E10>_<N10>`
//         (1 km, EPSG:25832; km = the 10 km block, e.g. 574/6020 → 32570_6020). Kiel LoD2_32_574_6020 →
//         HTTP 200 application/xml 12,851,633 B (⚠ Range NOT honoured — 200 with the whole body; the stamp
//         streams). 415 Buildings / 415 measuredHeight / 878 GroundSurface, CityGML 1.0 namespaces.
//         Index: single.php?file=LOD2_SH_Massendownload.geojson&id=4 → 5,839,682 B, 27,806 features
//         {id, datum, data_link}. lizenz.html: "Creative Commons (CC BY 4.0)".
//   • th  Thüringen — INSPIRE ATOM https://geoportal.geoportal-th.de/dienste/atom_th_gebaeude?type=dataset&
//         id=97d152b8-9e00-49f3-9ae4-8bbb30873562 → 2,219,942 B, 4,390 × `3dgebaeude/LoD2/LoD2_32_<E>_<N>_2_TH.zip`
//         (2 km, EPSG:25832). LoD2_32_642_5648_2_TH.zip (Erfurt) → 11,168,558 B; entry `…_TH.gml` deflate
//         140,837,473 B (!) — 6,870 Buildings / 9,337 measuredHeight / 18,674 GroundSurface / 15,004
//         BuildingPart mentions. Feed <rights>: "Datenlizenz Deutschland – Namensnennung – Version 2.0".
//   • rp  Rheinland-Pfalz — https://geobasis-rlp.de/data/geb3dlo/current/gml/ Apache listing, 5,266 ×
//         `LoD2_32_<E>_<N>_2_RP.gml` (2 km, EPSG:25832, PLAIN gml + .txt). LoD2_32_446_5538_2_RP.gml
//         (Mainz) range 0–400000 → HTTP 206 application/gml+xml; 15 Buildings / 22 measuredHeight /
//         44 GroundSurface / 38 BuildingPart mentions. Listing footer links geoshop.rlp.de/dl-de_by-2-0.html.
//   • mv  Mecklenburg-Vorpommern — INSPIRE ATOM https://www.geodaten-mv.de/dienste/gebaeude_atom?type=dataset&
//         id=8397b554-5cb9-4274-8be8-c20490d9a6e8 → 2,412,065 B, 6,344 × `gebaeude_download?index=0&dataset=…&
//         file=lod2_33_<E>_<N>_2_gml.zip` (2 km, EPSG:25833). lod2_33_262_5944 (Schwerin) → 2,829,879 B;
//         entry `LoD2_33_262_5944_2_MV.gml` 25.5 MB — 1,646 Buildings / 1,646 measuredHeight / 3,294
//         GroundSurface. Feed <rights> (verbatim): "… Quellenvermerk … © GeoBasis-DE/M-V (Jahr der letzten
//         Datenlieferung)" — attribution-only terms; NOT a dl-de URI, so the licence string below is the
//         feed's own words, not a guess.
//   • be  Berlin — datenregister.berlin.de package 3d-gebaudemodelle-im-level-of-detail-2-lod-2-3c7c49af →
//         license_id "dl-de-zero-2.0", url https://gdi.berlin.de/data/a_lod2/atom/ → 0.atom (130,824 B,
//         1,850 × `LoD2_<E>_<N>.zip`, E 371–415 / N 5799–5835 km, 1 km, EPSG:25833). LoD2_392_5820.zip
//         (Alexanderplatz) → 3,458,948 B; entry `LoD2_33_392_5820_1_BE.xml` 28.0 MB — 732 Buildings /
//         1,419 measuredHeight / 2,838 GroundSurface / 3,492 BuildingPart mentions. (FIS-Broker
//         fbinter.stadt-berlin.de/fb/atom/… answers HTTP 403 to every UA — the gdi.berlin.de feed is the door.)
//   • st  Sachsen-Anhalt — NOT tiles: a WFS 2.0, https://geodatenportal.sachsen-anhalt.de/ows_ST_LVermGeo_LoD2_WFS
//         (types ALKIS_LOD2_BU:BU.Building / BU.BuildingPart, DefaultCRS EPSG:4258, OUTPUTFORMAT GEOJSON,
//         ImplementsResultPaging). ⚠ BBOX must be lat,lon in urn:ogc:def:crs:EPSG::4258 — the same box in
//         25832 returned 0 features silently. Magdeburg Dom 52.122,11.632,52.127,11.637 → hits 31; features
//         carry HEIGHTABOVEGROUND (STRING, e.g. "1.56"), ELEVATION, LOCALID, MultiPolygon in EPSG:4326
//         lon,lat. No roofType. ⚠ The PARTS carry the geometry: Magdeburg box 52.120,11.625,52.135,11.645 →
//         BU.Building 325 features / BU.BuildingPart 3,599 (HEIGHTABOVEGROUND + BUILDINGREF) — query BOTH. Licence: the LVermGeo "Open Data" page names the download as kostenfrei;
//         the dl-de URI was NOT captured verbatim in this lane — recorded as such.
//   • nw  Nordrhein-Westfalen — LIVE since 2026-07-31 via heightSources.mjs (opengeodata.nrw.de index.json,
//         35,022 × `LoD2_32_<E>_<N>_1_NW.gml`, DL-DE Zero 2.0). Routed here too so the `germany` row's
//         stamp covers Köln by the same door; the koln city row stays until the orchestrator folds it.
//   • ni  Niedersachsen — WIRED 2026-09-05 (second pass; the first pass read it BLOCKED, and the reason was
//         the INDEX, not the data). The LGLN index single-datasets.opengeodata.lgln.niedersachsen.de/
//         pro-download-indices/lod2/lgln-opengeodata-lod2.geojson (14,303,041 B, 11,707 × 2 km, props 3DShape/
//         CityGML/tile_id) points at lod2.opengeodata.lgln.niedersachsen.de/<tile>/<date>/LOD2_<tile>_2_<date>.gml
//         — its OWN hrefs, verbatim, answer HTTP 404 `<Code>NoSuchKey</Code>` (Hannover 25505802 and first tile
//         23425822, .gml and .zip). But the bucket is S3-LISTABLE: `?list-type=2&max-keys=10` → 200
//         ListBucketResult, and the real objects sit FLAT at the root under a DIFFERENT scheme —
//         `LoD2_32_<E>_<N>_1_ni.gml` (1 km, EPSG:25832, PLAIN gml) + a `.json` sidecar per tile. Hannover
//         LoD2_32_550_5802_1_ni.gml → HEAD 200, 49,838,412 B, Accept-Ranges: bytes, Last-Modified 2024-09-03;
//         Range 0-300000 → 206; CityGML 1.0 AdV, srs ETRS89_UTM32*DE_DHHN2016_NH, measuredHeight/GroundSurface/
//         BuildingPart/roofType all present (34/34/58/34 in the first 300 KB). Sidecar: {"Standard AdV": 2.5,
//         "LetzteAenderung": "2024-06-12", bbox 9.7337,52.3658,9.7494,52.3751}. Prefix `LoD2_32_55` → 1,000
//         keys, IsTruncated. The "index" is therefore ONE ListObjectsV2 per candidate tile (prefix = exact key
//         → KeyCount 1 | 0): present LoD2_32_550_5802_1_ni.gml → KeyCount 1 (524 B); North Sea
//         LoD2_32_400_5990_1_ni.gml → KeyCount 0 (299 B) — an honest EMPTY, distinct from a listing failure.
//         Licence (verbatim, portal SPA main.js 1,198,837 B): "… können unter den Bedingungen der Lizenz
//         „Datenlizenz Deutschland – Namensnennung – Version 2.0“ (https://www.govdata.de/dl-de/by-2-0) kostenfrei
//         intern und extern genutzt werden"; the same bundle states LoD2 is "niedersachsenweit … seit 2019
//         abgeschlossen … flächendeckend". The index and bucket themselves carry NO licence field.
//   • by  Bayern — PROBED OPEN 2026-09-05: geodaten.bayern.de/odd/a/lod2/citygml/meta/metalink/09162000.meta4
//         (München) → HTTP 200 metalink4, 327 × https://download1.bayernwolke.de/a/lod2/citygml/<E>_<N>.gml
//         (2 km, EPSG:25832, PLAIN gml, Range honoured: 690_5334.gml → 206, 16 Buildings/17 measuredHeight);
//         Nutzungsbedingungen page lists "Creative Commons Namensnennung 4.0 International (CC BY 4.0)".
//         ⚠ UNARMED: the lane brief keeps Munich `blocked` (REGION_SOURCE munich) — this row records that
//         the block reason ("ZSHH INSPIRE-restricted") no longer matches the probe; arming is a decision.
//   • bw  Baden-Württemberg — WIRED 2026-09-05 (SECOND pass, §DE-LOD2-LAENDER-BW). The first pass called this
//         Land "unprobed — grid keying unresolved": it had the right directory (/data/lod2/) and the right
//         filename pattern (`LoD2_\d+_(\d+_\d+)_\d+_bw\.zip`, from assets/config/local/odp-products.json) and
//         still 404'd on six Stuttgart candidates, because it snapped the key to an EVEN easting the way every
//         other 2 km Land does. ⭐ BW's 2 km download grid is anchored on ODD eastings and EVEN northings.
//         WHERE THAT CAME FROM — not a guess: the portal's own grid layer is an MVT tileset,
//         core-layerconfig.json → `zwei_km_gitter` → https://opengeodata.lgl-bw.de/tiles/vts/2x2Gitter/{z}/{x}/{y}.pbf.
//         Tile 13/4304/2821 (Stuttgart) → HTTP 200, 13,547 B decoded, layer "2x2Gitter", 9 features, each
//         carrying a `metadata` JSON string with the DOWNLOAD URL per product, verbatim:
//           {"name": "513-5402", "products": [… {"name": "LoD2", "types": [{"type": "LoD2",
//            "fileName": "LoD2_32_513_5402_2_bw.zip", "downloadURL": "/data/lod2/LoD2_32_513_5402_2_bw.zip"}]} …]}
//         and its neighbours are 511-5402 / 513-5400 / 511-5400 — step 2 km, easting phase 1.
//         MEASURED 2026-09-05: all NINE tiles over the Stuttgart working-set bbox HEAD 200
//         (511/513/515 × 5400/5402/5404; 3,007,541 – 20,275,566 B, Accept-Ranges: bytes), while the even-easting
//         name the first pass tried, LoD2_32_512_5402_2_bw.zip, is 404 and an off-Land key
//         LoD2_32_301_5300_2_bw.zip is 404 — so a 404 here is an honest ABSENT, not a dead host.
//         ⚠ The `Kachel` column of the in-zip INFO_OpenData_LoD2_2026.txt lists EVEN eastings (470-5494,
//         502-5482 …). Those are 1 km ALKIS Kachel ids, NOT download tiles: LoD2_32_502_5482_2_bw.zip → 404,
//         LoD2_32_503_5482_2_bw.zip → 200. Do not re-derive the grid from that column.
//         DOOR SHAPE — the only Land whose zip is NOT "first entry is the CityGML": LoD2_32_513_5402_2_bw.zip
//         (18,031,959 B) holds 8 entries — a DIRECTORY entry first, a licence PDF, two txt, and FOUR 1 km GMLs
//         (513_5402, 513_5403, 514_5402, 514_5403 — the 2 km tile is its four 1 km quarters). Hence kind
//         `zip-multi`: read the central directory, Range-read every .gml entry. Entry LoD2_32_513_5402_1_BW.gml
//         (lho 379076, csize 5,014,391 → 45,141,138 chars inflated) → 1,525 Buildings · 853 BuildingParts ·
//         2,125 measuredHeight · 4,244 GroundSurface · srsName "urn:adv:crs:ETRS89_UTM32*DE_DHHN2016_NH" ·
//         srsDimension 3 · roofType codes 1000/2100/3100/3200/3500/4000/5000/9999 · max height 49.20 m.
//         Licence: the zip ships GOVDATA-Datenlizenz_Deutschland.pdf; INFO_OpenData_LoD2_2026.txt (verbatim)
//         states "Land: BW · Anzahl der 3D-Gebäude: 6 483 003 · Anzahl der gelieferten Kacheln: 9077 volle und
//         277 leere Kacheln (insgesamt 9354) · Koordinatenreferenzsysteme: ETRS89_UTM<32>DE_DHHN<2016 ·
//         Auslesedatum: 2026-02-04 - 2026-02-06 · Aktualität: ALKIS LoD2: 2025-04-01".
//   • sn  Sachsen — WIRED 2026-09-05 (THIRD pass, §DE-LOD2-LAENDER-SN). The first two passes read this Land
//         BLOCKED and the reason was a DEAD SHARE TOKEN, not a shut door. Both earlier probes resolved
//         Dresden through geodienste.sachsen.de's downloadlinks MapServer to
//         geocloud.landesvermessung.sachsen.de/public.php/dav/files/GVzwbSyp7Yl7mBD/… and read HTTP 503
//         Sabre\DAV ServiceUnavailable as "the host is down". ⭐ MEASURED 2026-09-05: 503 on that path is
//         what this Nextcloud answers for a ROTATED token — the same request against the CURRENT token is
//         200. A 503 here means "your token expired", and reading it as an outage is exactly the
//         failure≠empty conflation this file exists to refuse, one level up.
//         WHERE THE CURRENT TOKEN COMES FROM — never pinned, always read: the portal's own batch-download
//         page https://www.geodaten.sachsen.de/batch-download-4719.html (HTTP 200, 178,355 B) carries an
//         inline `batchConfig.products={…}` with 34 products, each `{fullname, share_id, packagesize,
//         filename, computed_not_existing}`, and a `createGeoCloudURL(share_id, filename)` that is literally
//         'https://geocloud.landesvermessung.sachsen.de/public.php/dav/files/' + share_id + '/' + filename.
//         Verbatim for LoD2: {"fullname":"3D-Stadtmodell LoD2 CityGML","share_id":"AyJqXpJAZJXomCb",
//         "packagesize":2000,"filename":"lod2_33$Rechtswert$_$Hochwert$_2_sn_citygml.zip"} — 94 grid cells
//         listed as computed_not_existing. `$Rechtswert$` is the tile id's first 3 digits and `$Hochwert$`
//         its next 4 (the page's own getSelectedGridCells), i.e. a 2 km key {e,n} → `lod2_33<e>_<n>_2_sn_citygml.zip`.
//         Because the token ROTATES, the router resolves it per run (indexKind 'sn-batch-config'); a
//         pinned token is how this Land was mis-read as dead for two passes.
//         ⚠ HEAD IS 401 ON EVERY TILE, PRESENT OR ABSENT — Nextcloud public WebDAV refuses HEAD while
//         serving GET. Presence is therefore a RANGE GET (`bytes=0-1`), measured 2026-09-05:
//         present → 206 / 2 B · absent → 404 / 261 B · dead token → 503 / 232 B. Three distinguishable
//         answers, which is what makes an honest ABSENT possible at all here.
//         MEASURED TILES (Dresden working set, GET, 2026-09-05): lod2_33410_5656_2_sn_citygml.zip → 200,
//         9,384,946 B, Last-Modified Wed 06 Aug 2025; 33408_5652 → 200, 12,594,244 B; 33414_5658 → 200,
//         3,129,331 B; off-Land 33300_5300 → 404, 261 B (an honest ABSENT, not a dead host).
//         GML SHAPE (33410_5656, walked with THIS file's own zipCentralDirectory/createBuildingSlicer):
//         2 entries — `lod2_33410_5656_2_sn.gml` (deflate, csize 9,384,576 → 70,428,635 chars) and a
//         `_akt.csv`; 1,523 bldg:Building · 1,713 BuildingPart · 5,702 measuredHeight · 8,108 GroundSurface
//         · srsDimension 3 · roofType 1000/2100/3100/3200/3400/3500/3700/3900/4000/5000/9999 · slicer
//         yields 2,851 parts, max height 60.92 m, median part area 91.9 m². ⚠ THE ONE DIVERGENCE: srsName
//         is `urn:ogc:def:crs,crs:EPSG:6.12:25833,crs:EPSG:6.12:7837` and the bldg namespace is CityGML
//         **1.0**, NOT the `urn:adv:crs:ETRS89_UTM3x*DE_DHHN2016_NH` string every other wired Land carries.
//         The stamp does not read srsName — the ZONE comes from this table (33) — so this is recorded, not
//         relied on; do not extend the header's "verified on every wired Land" claim to this string.
//         Licence: geodaten.sachsen.de publishes the batch download keyless; the dl-de URI was NOT captured
//         verbatim in this lane — recorded as such, exactly as Sachsen-Anhalt is.
//   • he  Hessen — BLOCKED, RE-PROBED 2026-09-05 (third pass) and still account-gated, now with the
//         keyless alternative ruled out by name. gds.hessen.de/…/ViewDownloadcenter-Start answers HTTP 200
//         (13,076 B) — the earlier "login" reading was of the LANDING page, not the door — but EVERY
//         dataset link on it routes to `ViewRegistration-View;pgid=…?SelectedMenuItem=Downloadcenter`, i.e.
//         registration. The keyless service that does exist,
//         www.gds-srv.hessen.de/cgi-bin/lika-services/ogc-free-maps.ows?SERVICE=WMS&REQUEST=GetCapabilities,
//         → HTTP 200, 174,116 B, 46 named layers (eel_dtk*, el_pg*, hboris*, he_alk*, he_dgm, he_dtk*,
//         he_pg*, he_uek*, wms_hako, wms_he_karten) and NOT ONE of them is LoD2, 3D or a building model —
//         `he_dgm` is a terrain raster, not a height per building. inspire-hessen.de is a hale»connect SPA
//         (200, 1,593 B shell) and /ows/bu?…GetCapabilities is 404; geodaten.hessen.de does not resolve (DNS).
//   • hb  Bremen — ⭐ PROBED-OPEN-UNSUPPORTED 2026-09-05 (third pass). The two earlier passes said "door not
//         located"; that is now FALSE and the correction matters more than the status. The door IS located,
//         IS keyless and DOES carry per-building measured heights — it is simply not CityGML, and this
//         router has no reader for the container it is in. Path, verbatim: geo.bremen.de/produkte/3d-produkte/
//         3d-gebaeudemodelle-11892 (200, 24,409 B) states LoD1+LoD2 are OPEN DATA "ab dem 9. Juni 2024 …
//         über das GeoPortal Bremen und MetaVer"; the Open-Data overview it links (…/open-data-
//         produktuebersicht-15654, 200, 37,712 B) lists SIX MetaVer records and NONE of them is the 3D
//         model. The 3D model is in the GeoPortal's own service list instead:
//         geoportal.bremen.de/geoportal/config.js → layerConf "../../resources/services.json" →
//         https://geoportal.bremen.de/resources/services.json (200, 1,304,605 B, 1,242 entries) holds FOUR
//         LoD2 layers, all `typ: "TileSet3D"` on bremen.virtualcitymap.de — id 400 "Gebäude (rote Dächer)
//         LOD2 Bremen", 401 "Gebäude LOD2 Bremen", 402 "Gebäude LOD2 Bremerhaven", 400_7 "…texturiert".
//         ⭐ THE ATTRIBUTES ARE THERE. tileset.json for 401 (…/datasource-data/15ecfa7c-abc0-40f9-9e1e-
//         2279d24e53b9/tileset.json → HTTP 200, 60,454 B gzipped / 937,219 B decoded) DECLARES
//         `measuredHeight` {valueType DOUBLE, minimum 1, maximum 249.02}, `roofType` (STRING) and
//         `storeysAboveGround` {INTEGER 1..15}. One leaf tile, 15/34315/6695.b3dm → HTTP 200, 12,545 B,
//         magic `b3dm` v1, BATCH_LENGTH 5, batch table 2,456 B carrying per-feature
//         {"roofType":"1000","measuredHeight":4.07,…} and {"roofType":"2100","measuredHeight":5.577,…} —
//         AdV roof codes DE_ROOF already maps, and heights to the millimetre.
//         ⛔ WHY IT IS NOT WIRED, stated as a BUILD and not as a barrier: the batch table carries NO
//         position (parentPosition −1; the tile's only geometry reference is RTC_CENTER in ECEF), so a
//         join to an OSM footprint needs the glTF parsed, its `_BATCHID` vertex attribute partitioned per
//         feature, and each feature's centroid transformed ECEF → WGS84. That is a new door KIND
//         (`3dtiles-b3dm`), not a new row in this table, and half-building it inside this lane's budget
//         would be worse than saying so. Bremen is OPEN and UNREAD, which is neither "blocked" nor "empty".
//         ⚠ Do NOT carry the Hamburg note across: this file's `hh` row says its 3D Tiles are "b3dm, no
//         attrs". That is true of HAMBURG's tileset and demonstrably FALSE of Bremen's — measured above.
//   • sl  Saarland — UNPROBED, RE-PROBED 2026-09-05 (third pass); the reason is sharpened, not resolved.
//         saarland.de/lvgl is still HTTP 403 behind a bunny-shield bot challenge. geoportal.saarland.de
//         itself answers 200 (30,160 B) and is a Mapbender/searchCatalogue shell, but its search is
//         CLIENT-SIDE: /search/?searchText=LoD2, ?searchText=3D-Gebäudemodell and ?searchText=Gebäudemodell
//         return a BYTE-IDENTICAL 15,329-byte page (200) with no result markup at all — which proves the
//         query was never executed, NOT that Saarland publishes no LoD2. /searchCatalogue/ is 404 and
//         mapbender/php/mod_getCsw.php?REQUEST=GetCapabilities is 404. Three identical answers to three
//         different questions is the signature of a probe that did not run; recorded as UNKNOWN.
// ─────────────────────────────────────────────────────────────────────────────

/** CityGML AdV roofType code → OSM roof:shape. An UNMAPPED or 9999 (Sonstiges) code emits NO tag —
 *  the same deliberate divergence from fetchLod2DeNrw that stampLod2NrwHeightsOnGeojsonseq records. */
export const DE_ROOF = {
  1000: 'flat', 2100: 'skillion', 2200: 'skillion', 3100: 'gabled', 3200: 'hipped',
  3300: 'half-hipped', 3400: 'mansard', 3500: 'pyramidal', 3600: 'conical', 3700: 'dome',
  4000: 'sawtooth', 5000: 'dome',
};

const MV_DATASET = '8397b554-5cb9-4274-8be8-c20490d9a6e8';
const TH_DATASET = '97d152b8-9e00-49f3-9ae4-8bbb30873562';

/**
 * The per-Land adapter table. `status` is the router's honest word for each Land; only `wired` rows
 * carry a door. Tile keys are `{ e, n }` in WHOLE KILOMETRES of the Land's UTM zone (the publishers'
 * own grids); `tileM` is the tile edge, so a 2 km Land has even keys only.
 *   kind 'gml'       — one HTTP GET returns CityGML text (streamed).
 *   kind 'zip'       — one HTTP GET returns a zip whose FIRST entry is the CityGML (streamed through inflate).
 *   kind 'zip-entry' — one national archive; the entry for a tile is RANGE-read off its central directory.
 *   kind 'wfs'       — GetFeature GeoJSON per tile bbox (Sachsen-Anhalt).
 */
export const DE_LOD2_LAENDER = {
  nw: {
    land: 'Nordrhein-Westfalen', status: 'wired', zone: 32, tileM: 1000, kind: 'gml',
    indexKind: 'nrw-index-json', indexUrl: 'https://www.opengeodata.nrw.de/produkte/geobasis/3dg/lod2_gml/lod2_gml/index.json',
    tileName: ({ e, n }) => `LoD2_32_${e}_${n}_1_NW.gml`,
    tileUrl: ({ e, n }) => `https://www.opengeodata.nrw.de/produkte/geobasis/3dg/lod2_gml/lod2_gml/LoD2_32_${e}_${n}_1_NW.gml`,
    licence: 'DL-DE Zero 2.0', attribution: '© GeoBasis NRW',
    probe: 'live since 2026-07-31 (heightSources.mjs lod2de_nrw); 35,022 tiles in index.json',
  },
  bb: {
    land: 'Brandenburg', status: 'wired', zone: 33, tileM: 1000, kind: 'zip',
    indexKind: 'html-listing', indexUrl: 'https://data.geobasis-bb.de/geobasis/daten/3d_gebaeude/lod2_gml/',
    tileName: ({ e, n }) => `lod2_33${e}-${n}.zip`,
    tileUrl: ({ e, n }) => `https://data.geobasis-bb.de/geobasis/daten/3d_gebaeude/lod2_gml/lod2_33${e}-${n}.zip`,
    licence: 'dl-de/by-2-0', attribution: '© GeoBasis-DE/LGB',
    probe: '2026-09-05 lod2_33368-5807.zip HTTP 200 2,890,413 B; entry _geb.gml 23.8 MB; 767 Buildings/1,620 measuredHeight',
  },
  hh: {
    land: 'Hamburg', status: 'wired', zone: 32, tileM: 1000, kind: 'zip-entry',
    indexKind: 'zip-central-directory', indexUrl: 'https://daten-hamburg.de/opendata/3d_stadtmodell_lod2/LoD2-DE_HH_2025-03-14.zip',
    tileName: ({ e, n }) => `LoD2_32_${e}_${n}_1_HH.xml`,
    tileUrl: () => 'https://daten-hamburg.de/opendata/3d_stadtmodell_lod2/LoD2-DE_HH_2025-03-14.zip',
    licence: 'dl-de-by-2.0', attribution: '© Freie und Hansestadt Hamburg, LGV',
    probe: '2026-09-05 archive 656,326,904 B Accept-Ranges; 782 entries; LoD2_32_566_5934 range 1,668,392 B → 547 Buildings/547 measuredHeight',
  },
  sh: {
    land: 'Schleswig-Holstein', status: 'wired', zone: 32, tileM: 1000, kind: 'gml',
    indexKind: 'geojson-datalink', indexUrl: 'https://geodaten.schleswig-holstein.de/gaialight-sh/_apps/dladownload/single.php?file=LOD2_SH_Massendownload.geojson&id=4',
    tileName: ({ e, n }) => `LoD2_32_${e}_${n}_1_SH.xml`,
    tileUrl: ({ e, n }) => `https://geodaten.schleswig-holstein.de/gaialight-sh/_apps/dladownload/massen.php?file=LoD2_32_${e}_${n}_1_SH.xml&id=4&live=2024&km=32${Math.floor(e / 10) * 10}_${Math.floor(n / 10) * 10}`,
    licence: 'CC BY 4.0', attribution: '© GeoBasis-DE/LVermGeo SH',
    probe: '2026-09-05 LoD2_32_574_6020 HTTP 200 application/xml 12,851,633 B (Range ignored); 415 Buildings/415 measuredHeight; index 27,806 features',
  },
  th: {
    land: 'Thüringen', status: 'wired', zone: 32, tileM: 2000, kind: 'zip',
    indexKind: 'atom', indexUrl: `https://geoportal.geoportal-th.de/dienste/atom_th_gebaeude?type=dataset&id=${TH_DATASET}`,
    tileName: ({ e, n }) => `LoD2_32_${e}_${n}_2_TH.zip`,
    tileUrl: ({ e, n }) => `https://geoportal.geoportal-th.de/3dgebaeude/LoD2/LoD2_32_${e}_${n}_2_TH.zip`,
    licence: 'dl-de/by-2-0', attribution: '© GDI-Th',
    probe: '2026-09-05 LoD2_32_642_5648_2_TH.zip 11,168,558 B; gml 140.8 MB; 6,870 Buildings/9,337 measuredHeight; feed 4,390 LoD2 links',
  },
  rp: {
    land: 'Rheinland-Pfalz', status: 'wired', zone: 32, tileM: 2000, kind: 'gml',
    indexKind: 'html-listing', indexUrl: 'https://geobasis-rlp.de/data/geb3dlo/current/gml/',
    tileName: ({ e, n }) => `LoD2_32_${e}_${n}_2_RP.gml`,
    tileUrl: ({ e, n }) => `https://geobasis-rlp.de/data/geb3dlo/current/gml/LoD2_32_${e}_${n}_2_RP.gml`,
    licence: 'dl-de/by-2-0', attribution: '© GeoBasis-DE/LVermGeoRP',
    probe: '2026-09-05 LoD2_32_446_5538_2_RP.gml range 0-400000 → 206 application/gml+xml; listing 5,266 .gml',
  },
  mv: {
    land: 'Mecklenburg-Vorpommern', status: 'wired', zone: 33, tileM: 2000, kind: 'zip',
    indexKind: 'atom', indexUrl: `https://www.geodaten-mv.de/dienste/gebaeude_atom?type=dataset&id=${MV_DATASET}`,
    tileName: ({ e, n }) => `lod2_33_${e}_${n}_2_gml.zip`,
    tileUrl: ({ e, n }) => `https://www.geodaten-mv.de/dienste/gebaeude_download?index=0&dataset=${MV_DATASET}&file=lod2_33_${e}_${n}_2_gml.zip`,
    licence: 'attribution-only per feed <rights>: "© GeoBasis-DE/M-V (Jahr der letzten Datenlieferung)" — no dl-de URI published',
    attribution: '© GeoBasis-DE/M-V 2025',
    probe: '2026-09-05 lod2_33_262_5944_2_gml.zip 2,829,879 B; gml 25.5 MB; 1,646 Buildings/1,646 measuredHeight; feed 6,344 links',
  },
  be: {
    land: 'Berlin', status: 'wired', zone: 33, tileM: 1000, kind: 'zip',
    indexKind: 'atom', indexUrl: 'https://gdi.berlin.de/data/a_lod2/atom/0.atom',
    tileName: ({ e, n }) => `LoD2_${e}_${n}.zip`,
    tileUrl: ({ e, n }) => `https://gdi.berlin.de/data/a_lod2/atom/LoD2_${e}_${n}.zip`,
    licence: 'dl-de-zero-2.0', attribution: '© Geoportal Berlin',
    probe: '2026-09-05 LoD2_392_5820.zip 3,458,948 B; entry LoD2_33_392_5820_1_BE.xml 28.0 MB; 732 Buildings/1,419 measuredHeight; 0.atom 1,850 links',
  },
  st: {
    land: 'Sachsen-Anhalt', status: 'wired', zone: 32, tileM: 1000, kind: 'wfs',
    indexKind: 'none', indexUrl: 'https://geodatenportal.sachsen-anhalt.de/ows_ST_LVermGeo_LoD2_WFS?Service=WFS&Request=GetCapabilities&Version=2.0.0',
    tileName: ({ e, n }) => `ST_WFS_32_${e}_${n}`,
    tileUrl: () => 'https://geodatenportal.sachsen-anhalt.de/ows_ST_LVermGeo_LoD2_WFS',
    heightField: 'HEIGHTABOVEGROUND', count: 5000,
    // BOTH typenames, on evidence: over the Magdeburg proof box (52.120,11.625,52.135,11.645) BU.Building answered
    // 325 features but BU.BuildingPart 3,599 — the height-bearing geometry is mostly in the PARTS (2,621 part
    // centroids fall inside OSM footprints vs 220 building centroids). Buildings-only stamped 133/626; parts are the door.
    typeNames: ['ALKIS_LOD2_BU:BU.Building', 'ALKIS_LOD2_BU:BU.BuildingPart'],
    licence: 'LVermGeo LSA Open Data (kostenfrei) — dl-de URI not captured verbatim this lane',
    attribution: '© GeoBasis-DE/LVermGeo LSA',
    probe: '2026-09-05 GetFeature BBOX=52.122,11.632,52.127,11.637,urn:ogc:def:crs:EPSG::4258 → 200 GEOJSON, hits 31, HEIGHTABOVEGROUND "1.56"',
  },
  ni: {
    land: 'Niedersachsen', status: 'wired', zone: 32, tileM: 1000, kind: 'gml',
    // NOT the LGLN geojson index (its hrefs are stale → NoSuchKey): the bucket itself, listed per tile.
    indexKind: 's3-prefix', indexUrl: 'https://lod2.opengeodata.lgln.niedersachsen.de/',
    tileName: ({ e, n }) => `LoD2_32_${e}_${n}_1_ni.gml`,
    tileUrl: ({ e, n }) => `https://lod2.opengeodata.lgln.niedersachsen.de/LoD2_32_${e}_${n}_1_ni.gml`,
    licence: 'Datenlizenz Deutschland – Namensnennung – Version 2.0 (dl-de/by-2-0; verbatim from opengeodata.lgln.niedersachsen.de/main.js, 2026-09-05)',
    attribution: '© GeoBasis-DE/LGLN 2024',
    probe: '2026-09-05 LoD2_32_550_5802_1_ni.gml HEAD 200 49,838,412 B Accept-Ranges; Range 0-300000 → 206; 34 measuredHeight/58 BuildingPart in 300 KB; ListObjectsV2 prefix probe KeyCount 1 (present) / 0 (North Sea 400_5990)',
  },
  bw: {
    land: 'Baden-Württemberg', status: 'wired', zone: 32, tileM: 2000, kind: 'zip-multi',
    // ⭐ THE ONE FIELD THAT UNBLOCKED THIS LAND. Every other 2 km Land snaps to an EVEN key; BW's download
    // grid is phase-shifted one kilometre east (511, 513, 515 …) with EVEN northings. `eAnchorKm` is the
    // phase, not a fudge — it reproduces the names the portal's own 2x2Gitter MVT publishes (header).
    eAnchorKm: 1,
    // No listing and no index file: /data/lod2/ is 403 (directory listing off) while the objects under it are
    // public. The index is therefore ONE HEAD per candidate tile, gated by TWO controls that must BOTH hold
    // before a 404 is allowed to mean "absent" (§CONTEXT-DATA-HONESTY — failure ≠ empty).
    indexKind: 'head-probe',
    controlPresentTile: 'LoD2_32_513_5402_2_bw.zip',   // measured 2026-09-05: HEAD 200, 18,031,959 B
    controlAbsentTile: 'LoD2_32_512_5402_2_bw.zip',    // measured 2026-09-05: HEAD 404 (the even-key name)
    baseUrl: 'https://opengeodata.lgl-bw.de/data/lod2/',
    tileName: ({ e, n }) => `LoD2_32_${e}_${n}_2_bw.zip`,
    tileUrl: ({ e, n }) => `https://opengeodata.lgl-bw.de/data/lod2/LoD2_32_${e}_${n}_2_bw.zip`,
    licence: 'Datenlizenz Deutschland (GOVDATA-Datenlizenz_Deutschland.pdf ships INSIDE every tile zip; the LGL Open-Data portal publishes the product keyless)',
    attribution: '© LGL, www.lgl-bw.de',
    probe: '2026-09-05 LoD2_32_513_5402_2_bw.zip HEAD 200 18,031,959 B Accept-Ranges; 8 entries, 4 × 1 km gml; entry LoD2_32_513_5402_1_BW.gml 45.1 MB → 1,525 Buildings/853 BuildingParts/2,125 measuredHeight; 9/9 Stuttgart tiles 200, even-key 512 and off-Land 301_5300 both 404; grid names read from tiles/vts/2x2Gitter/13/4304/2821.pbf',
  },
  by: { land: 'Bayern', status: 'probed-open-unarmed', zone: 32, tileM: 2000, kind: 'gml', tileName: ({ e, n }) => `${e}_${n}.gml`, tileUrl: ({ e, n }) => `https://download1.bayernwolke.de/a/lod2/citygml/${e}_${n}.gml`, licence: 'CC BY 4.0 (geodaten.bayern.de Nutzungsbedingungen, probed 2026-09-05)', reason: 'keyless 2 km gml verified 2026-09-05 (690_5334.gml → HTTP 206, 16 Buildings); lane brief keeps munich blocked — arming is a founder decision, the REGION_SOURCE munich reason is stale' },
  sn: {
    land: 'Sachsen', status: 'wired', zone: 33, tileM: 2000, kind: 'zip',
    // ⭐ THE TOKEN IS NOT PINNED. `share_id` is a Nextcloud public-share token that ROTATES — the one two
    // earlier passes hard-coded (GVzwbSyp7Yl7mBD) now answers 503, which is what this Nextcloud says for an
    // EXPIRED token and NOT what it says for an outage. So the index is the portal's own batch-download page:
    // one GET, parse `batchConfig.products.LoD2_CityGML` (parseSnBatchConfig below), and every tile URL is
    // built from THAT run's token. If the page stops carrying it, the Land ERRORS by name — it never
    // degrades to "Sachsen has no LoD2" (§CONTEXT-DATA-HONESTY).
    indexKind: 'sn-batch-config',
    indexUrl: 'https://www.geodaten.sachsen.de/batch-download-4719.html',
    productKey: 'LoD2_CityGML',
    geocloudBase: 'https://geocloud.landesvermessung.sachsen.de/public.php/dav/files/',
    // Presence is a RANGE GET, never a HEAD: this host answers 401 to HEAD on present AND absent tiles.
    presenceProbe: 'range-get',
    controlPresentTile: 'lod2_33410_5656_2_sn_citygml.zip',  // measured 2026-09-05: GET 200, 9,384,946 B
    controlAbsentTile: 'lod2_33300_5300_2_sn_citygml.zip',   // measured 2026-09-05: GET 404, 261 B (off-Land)
    tileName: ({ e, n }) => `lod2_33${e}_${n}_2_sn_citygml.zip`,
    // Resolved per run: `index.shareId` is the token this run read off the batch page. The fallback token is
    // the one MEASURED on 2026-09-05 and is used only so a URL can be formed in tests/logs — a run whose
    // index failed never reaches here (loadIndex returns ok:false and the Land is skipped by name).
    tileUrl: ({ e, n }, index) => `https://geocloud.landesvermessung.sachsen.de/public.php/dav/files/${index?.shareId ?? 'AyJqXpJAZJXomCb'}/lod2_33${e}_${n}_2_sn_citygml.zip`,
    licence: 'geodaten.sachsen.de batch download, keyless (no dl-de URI captured verbatim this lane)',
    attribution: '© GeoSN',
    probe: '2026-09-05 batch page 178,355 B → share_id AyJqXpJAZJXomCb; lod2_33410_5656_2_sn_citygml.zip GET 200 9,384,946 B (HEAD 401), 33408_5652 200 12,594,244 B, 33414_5658 200 3,129,331 B, off-Land 33300_5300 404 261 B, dead token 503 232 B; entry gml 70.4 M chars → 1,523 Buildings/1,713 BuildingParts/5,702 measuredHeight, 2,851 parts, max 60.92 m',
  },  he: { land: 'Hessen', status: 'blocked', reason: 'gds.hessen.de Downloadcenter answers HTTP 200 (13,076 B) but every dataset link routes to ViewRegistration-View — account-gated; and the keyless alternative is ruled out by name: www.gds-srv.hessen.de/cgi-bin/lika-services/ogc-free-maps.ows GetCapabilities → 200, 174,116 B, 46 layers, NOT ONE of them LoD2/3D/building (he_dgm is terrain, not a per-building height); inspire-hessen.de/ows/bu 404; geodaten.hessen.de does not resolve (DNS). Re-probed 2026-09-05, third pass' },
  hb: {
    land: 'Bremen', status: 'probed-open-unsupported', zone: 32,
    // ⭐ NOT "no door" and NOT "no data": the door is OPEN, keyless, and carries measuredHeight — in a
    // container this router cannot read. Wiring it is a new door KIND (b3dm batch table + glTF _BATCHID
    // centroids), which is a BUILD; recording it as `unprobed` would have been the lie.
    container: '3dtiles-b3dm',
    indexUrl: 'https://geoportal.bremen.de/resources/services.json',
    tilesetUrl: 'https://bremen.virtualcitymap.de/datasource-data/15ecfa7c-abc0-40f9-9e1e-2279d24e53b9/tileset.json',
    attributes: ['measuredHeight', 'roofType', 'storeysAboveGround'],
    reason: 'LoD2 IS open and keyless, as 3D Tiles rather than CityGML: geoportal.bremen.de/resources/services.json (200, 1,304,605 B, 1,242 entries) lists four TileSet3D LoD2 layers on bremen.virtualcitymap.de; tileset.json (200, 60,454 B gz / 937,219 B) DECLARES measuredHeight DOUBLE 1..249.02, roofType and storeysAboveGround 1..15; leaf 15/34315/6695.b3dm (200, 12,545 B, BATCH_LENGTH 5) carries per-feature {"roofType":"1000","measuredHeight":4.07} and {"roofType":"2100","measuredHeight":5.577}. UNWIRED because the batch table has NO position (parentPosition -1, geometry only via RTC_CENTER) — a join needs glTF _BATCHID centroids ECEF→WGS84, i.e. a new door kind, not a table row. Probed 2026-09-05, third pass',
  },
  sl: { land: 'Saarland', status: 'unprobed', reason: 'saarland.de/lvgl HTTP 403 bunny-shield bot challenge; geoportal.saarland.de answers 200 (30,160 B) but its catalogue search is CLIENT-SIDE — /search/?searchText=LoD2, =3D-Gebäudemodell and =Gebäudemodell all return a BYTE-IDENTICAL 15,329 B page with no result markup, which proves the query never ran rather than that Saarland has no LoD2; /searchCatalogue/ 404, mapbender/php/mod_getCsw.php GetCapabilities 404. UNKNOWN, not empty. Re-probed 2026-09-05, third pass' },
};

// 'probed-open-unsupported' (Bremen, 2026-09-05) is deliberately DISTINCT from both 'blocked' and
// 'unprobed': the door is open and keyless and carries measuredHeight, but in a container this router has
// no reader for. Collapsing it into either of the other two would report a BUILD as a BARRIER.
export const DE_LOD2_STATUSES = ['wired', 'blocked', 'unprobed', 'probed-open-unarmed', 'probed-open-unsupported'];

/** WGS84 (lat,lon) → ETRS89/UTM zone `zone`N easting/northing in metres (Snyder forward TM, GRS80).
 *  Zone-parameterised twin of heightSources.wgs84ToUtm32 (which hard-codes lon0 = 9°): 32 → EPSG:25832
 *  (west of ~12° E), 33 → EPSG:25833 (Berlin, Brandenburg, M-V, Sachsen). ETRS89 ≈ WGS84 (< 1 m). */
export function wgs84ToUtm(lat, lon, zone) {
  const a = 6378137.0, f = 1 / 298.257223563, k0 = 0.9996, lon0 = ((zone * 6 - 183) * Math.PI) / 180;
  const e2 = f * (2 - f), ep2 = e2 / (1 - e2);
  const φ = (lat * Math.PI) / 180, λ = (lon * Math.PI) / 180;
  const N = a / Math.sqrt(1 - e2 * Math.sin(φ) ** 2);
  const T = Math.tan(φ) ** 2, C = ep2 * Math.cos(φ) ** 2, A = Math.cos(φ) * (λ - lon0);
  const M = a * ((1 - e2 / 4 - (3 * e2 ** 2) / 64 - (5 * e2 ** 3) / 256) * φ
    - ((3 * e2) / 8 + (3 * e2 ** 2) / 32 + (45 * e2 ** 3) / 1024) * Math.sin(2 * φ)
    + ((15 * e2 ** 2) / 256 + (45 * e2 ** 3) / 1024) * Math.sin(4 * φ)
    - ((35 * e2 ** 3) / 3072) * Math.sin(6 * φ));
  const easting = k0 * N * (A + ((1 - T + C) * A ** 3) / 6
    + ((5 - 18 * T + T ** 2 + 72 * C - 58 * ep2) * A ** 5) / 120) + 500000;
  const northing = k0 * (M + N * Math.tan(φ) * ((A ** 2) / 2
    + ((5 - T + 9 * C + 4 * C ** 2) * A ** 4) / 24
    + ((61 - 58 * T + T ** 2 + 600 * C - 330 * ep2) * A ** 6) / 720));
  return [easting, northing];
}

/** Native (E, N) metres → the adapter's tile key { e, n } in km, snapped to its grid.
 *  A publisher's grid has a STEP (`tileM`) and a PHASE. Every Land but one has phase 0, so a 2 km Land
 *  snaps to EVEN keys; Baden-Württemberg's download grid is phase-shifted one kilometre east
 *  (`eAnchorKm: 1` → 511, 513, 515 …), which is exactly what made its first-pass probes 404. `nAnchorKm`
 *  is provided for symmetry; no wired Land needs it today. Absent both, this is the old expression. */
export function tileKeyFor(adapter, E, N) {
  const stepKm = adapter.tileM / 1000;
  const aE = adapter.eAnchorKm ?? 0, aN = adapter.nAnchorKm ?? 0;
  return {
    e: Math.floor((E - aE * 1000) / adapter.tileM) * stepKm + aE,
    n: Math.floor((N - aN * 1000) / adapter.tileM) * stepKm + aN,
  };
}

/** Native [minE, minN, maxE, maxN] of a tile key. */
export function tileBboxNative(adapter, { e, n }) {
  return [e * 1000, n * 1000, e * 1000 + adapter.tileM, n * 1000 + adapter.tileM];
}

/** Sachsen-Anhalt GetFeature URL for a WGS84 box — BBOX is LAT,LON in EPSG:4258 (the probe's lesson). */
export function stGetFeatureUrl(adapter, [w, s, e, n], { count = adapter.count ?? 5000, typeName = 'ALKIS_LOD2_BU:BU.Building' } = {}) {
  const f = (x) => x.toFixed(6);
  return `${adapter.tileUrl()}?SERVICE=WFS&VERSION=2.0.0&REQUEST=GetFeature&TYPENAMES=${typeName}` +
    `&BBOX=${f(s)},${f(w)},${f(n)},${f(e)},urn:ogc:def:crs:EPSG::4258&COUNT=${count}&OUTPUTFORMAT=GEOJSON`;
}

// ── index parsers (each: text → Set of tile NAMES as `tileName` produces them) ──────────────────
/** Apache-style listing → Set of hrefs (BB, RP). */
export function parseHtmlListing(html) {
  const out = new Set();
  for (const m of String(html ?? '').matchAll(/href="([^"?/][^"]*)"/g)) out.add(m[1]);
  return out;
}
/** INSPIRE ATOM dataset feed → Set of link basenames (TH, BE) or `file=` names (MV). */
export function parseAtomTileNames(xml) {
  const out = new Set();
  for (const m of String(xml ?? '').matchAll(/<link[^>]*href="([^"]+)"[^>]*>/g)) {
    const href = m[1].replace(/&amp;/g, '&');
    const file = href.match(/[?&]file=([^&]+)/);
    out.add(file ? file[1] : href.split('/').pop());
  }
  return out;
}
/** NRW index.json → Set of tile names. */
export function parseNrwIndex(json) {
  try { return new Set((JSON.parse(json).datasets?.[0]?.files ?? []).map((f) => f.name)); } catch { return null; }
}
/** SH Massendownload GeoJSON → Set of `LoD2_32_E_N_1_SH.xml` names (from each feature's data_link). */
export function parseShIndex(text) {
  const out = new Set();
  for (const m of String(text ?? '').matchAll(/file=(LoD2_32_\d+_\d+_1_SH\.xml)/g)) out.add(m[1]);
  return out;
}
/** NI — the LGLN bucket is S3-listable: ONE ListObjectsV2 with the exact key as `prefix` answers KeyCount 1 | 0.
 *  (The published geojson index is NOT used: its dated 2 km hrefs answer NoSuchKey — see the header.) */
export function s3PrefixProbeUrl(adapter, name) {
  return `${adapter.indexUrl}?list-type=2&prefix=${encodeURIComponent(name)}&max-keys=1`;
}
/** ListBucketResult XML → KeyCount. 0 is an honest EMPTY (no such tile); a body that is not a
 *  ListBucketResult (an error page, a truncated read, an S3 <Error>) is null = UNKNOWN, never 0. */
export function parseS3KeyCount(xml) {
  const s = String(xml ?? '');
  if (!/<ListBucketResult\b/.test(s)) return null;
  const m = s.match(/<KeyCount>(\d+)<\/KeyCount>/);
  return m ? Number(m[1]) : null;
}

/**
 * SN — the batch-download page's own `batchConfig.products={…}` object, brace-matched out of the HTML and
 * JSON-parsed. This is Sachsen's INDEX: it carries the current Nextcloud share token, the filename
 * template, and the publisher's own list of grid cells that do not exist.
 *
 * Returns null for ANY body that does not contain a parseable products object — a login page, a truncated
 * read, a redesigned portal. Null is UNKNOWN, never "Sachsen has no LoD2": the caller must fail the Land
 * by name rather than stamp nothing and call it empty.
 * @param {string} html
 * @param {string} productKey
 * @returns {{shareId:string, filename:string, packagesize:number, notExisting:number[], products:number}|null}
 */
export function parseSnBatchConfig(html, productKey = 'LoD2_CityGML') {
  const s = String(html ?? '');
  const i = s.indexOf('batchConfig.products=');
  if (i < 0) return null;
  const start = s.indexOf('{', i);
  if (start < 0) return null;
  let depth = 0, end = -1, inStr = false, esc = false;
  for (let k = start; k < s.length; k++) {
    const c = s[k];
    if (inStr) { if (esc) esc = false; else if (c === '\\') esc = true; else if (c === '"') inStr = false; continue; }
    if (c === '"') inStr = true;
    else if (c === '{') depth++;
    else if (c === '}') { depth--; if (depth === 0) { end = k + 1; break; } }
  }
  if (end < 0) return null;
  let products;
  try { products = JSON.parse(s.slice(start, end)); } catch { return null; }
  const p = products?.[productKey];
  if (!p || typeof p.share_id !== 'string' || !p.share_id || typeof p.filename !== 'string' || !p.filename) return null;
  const ne = Array.isArray(p.computed_not_existing) ? p.computed_not_existing : [];
  return { shareId: p.share_id, filename: p.filename, packagesize: Number(p.packagesize), notExisting: ne, products: Object.keys(products).length };
}

/** SN — `createGeoCloudURL(share_id, filename)`, verbatim from the batch page's own JS. */
export function snGeoCloudUrl(shareId, filename, base = DE_LOD2_LAENDER.sn.geocloudBase) {
  return `${base}${shareId}/${filename}`;
}

/**
 * SN — the page's filename template → a tile name for a key. The portal builds the grid cell id as
 * `${e}${n}` (3-digit easting km + 4-digit northing km) and then substitutes `$Rechtswert$` = its first
 * three characters and `$Hochwert$` = the next four, which is the same thing said twice; this reproduces
 * that literally so a template change is visible rather than silently absorbed.
 */
export function snTileNameFromTemplate(template, { e, n }) {
  const cell = `${e}${n}`;
  return String(template)
    .replace('$Kachelnummer$', cell)
    .replace('$Rechtswert$', cell.slice(0, 3))
    .replace('$Hochwert$', cell.slice(3, 7));
}

/**
 * Range-GET status → tile presence, for the `range-get` presence probe (SN: HEAD is 401 on every tile).
 * 200/206 → true · 404/410 → false (an honest ABSENT) · ANYTHING ELSE → null (UNKNOWN).
 * ⚠ 503 IS NOT AN OUTAGE HERE — it is what this Nextcloud answers for a ROTATED share token, and reading
 * it as a dead host is precisely what kept Sachsen marked `blocked` for two passes. It maps to null, so a
 * caller counts a tile ERROR and the Land reports a failure by name; it never becomes "no tile".
 */
export function rangeProbePresence(status) {
  if (status === 200 || status === 206) return true;
  if (status === 404 || status === 410) return false;
  return null;
}

// ── ZIP walking (pure Buffer maths; the network half streams the bytes) ─────────────────────────
/** Parse ONE local file header at `off`. Returns null when the bytes are not a local header. */
export function zipLocalHeader(buf, off = 0) {
  if (buf.length < off + 30 || buf.readUInt32LE(off) !== 0x04034b50) return null;
  const flags = buf.readUInt16LE(off + 6), method = buf.readUInt16LE(off + 8);
  const csize = buf.readUInt32LE(off + 18), usize = buf.readUInt32LE(off + 22);
  const nlen = buf.readUInt16LE(off + 26), elen = buf.readUInt16LE(off + 28);
  if (buf.length < off + 30 + nlen + elen) return null;
  const name = buf.toString('utf8', off + 30, off + 30 + nlen);
  return { name, flags, method, csize, usize, dataStart: off + 30 + nlen + elen, dataDescriptor: (flags & 8) !== 0 };
}
/** Parse a central directory (the bytes at EOCD.cdOffset, length EOCD.cdSize) → Map name → entry. */
export function zipCentralDirectory(cd) {
  const out = new Map();
  let p = 0;
  while (p + 46 <= cd.length && cd.readUInt32LE(p) === 0x02014b50) {
    const method = cd.readUInt16LE(p + 10), csize = cd.readUInt32LE(p + 20), usize = cd.readUInt32LE(p + 24);
    const nlen = cd.readUInt16LE(p + 28), elen = cd.readUInt16LE(p + 30), clen = cd.readUInt16LE(p + 32);
    const lho = cd.readUInt32LE(p + 42);
    out.set(cd.toString('utf8', p + 46, p + 46 + nlen), { method, csize, usize, lho });
    p += 46 + nlen + elen + clen;
  }
  return out;
}
/** Find the End-Of-Central-Directory record in a TAIL buffer of a `total`-byte archive. */
export function zipEocd(tail, total) {
  for (let i = tail.length - 22; i >= 0; i--) {
    if (tail.readUInt32LE(i) === 0x06054b50) {
      const entries = tail.readUInt16LE(i + 10), cdSize = tail.readUInt32LE(i + 12), cdOffset = tail.readUInt32LE(i + 16);
      if (entries === 0xffff || cdOffset === 0xffffffff) return { zip64: true };
      return { entries, cdSize, cdOffset, total };
    }
  }
  return null;
}

/**
 * The CityGML entries of a parsed central directory, in name order.
 * BW is the only Land whose per-tile zip is NOT "first entry is the CityGML": it holds a DIRECTORY entry,
 * a licence PDF, two txt files and FOUR 1 km GMLs (the 2 km tile's quarters). Directory entries end in `/`
 * and carry usize 0; anything that is not .gml/.xml is skipped by name. Sorted so a run is deterministic.
 * @param {Map<string, {method:number,csize:number,usize:number,lho:number}>} map
 * @returns {Array<[string, object]>}
 */
export function zipGmlEntries(map) {
  return [...map.entries()]
    .filter(([name]) => !name.endsWith('/') && /\.(gml|xml)$/i.test(name))
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
}

/**
 * HEAD status → tile presence, for the `head-probe` index kind (BW: no listing, public objects).
 * 200/206 → true (present) · 404/410 → false (an honest ABSENT) · ANYTHING ELSE → null (UNKNOWN).
 * A 403, a 5xx or a network error is NOT "no tile here" — the caller must count those as tile ERRORS,
 * never as empty (§CONTEXT-DATA-HONESTY: failure ≠ empty). Callers must additionally hold the adapter's
 * two controls (a known-present and a known-absent name) before trusting any `false` from this.
 */
export function headProbePresence(status) {
  if (status === 200 || status === 206) return true;
  if (status === 404 || status === 410) return false;
  return null;
}

// ── CityGML → parts ─────────────────────────────────────────────────────────────────────────────
function parseNativeRing(text, dim) {
  const nums = String(text).trim().split(/\s+/).map(Number);
  const ring = [];
  for (let i = 0; i + dim <= nums.length; i += dim) {
    const E = nums[i], N = nums[i + 1];
    if (!Number.isFinite(E) || !Number.isFinite(N)) return null;
    ring.push([E, N]);
  }
  if (ring.length < 3) return null;
  const f = ring[0], l = ring[ring.length - 1];
  if (f[0] !== l[0] || f[1] !== l[1]) ring.push([f[0], f[1]]);
  return ring.length < 4 ? null : ring;
}
/** Shoelace area + area centroid of a native ring (vertex-mean fallback for a degenerate ring). */
export function ringAreaCentroid(ring) {
  let a2 = 0, cx = 0, cy = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const cross = ring[j][0] * ring[i][1] - ring[i][0] * ring[j][1];
    a2 += cross; cx += (ring[j][0] + ring[i][0]) * cross; cy += (ring[j][1] + ring[i][1]) * cross;
  }
  const areaM2 = Math.abs(a2) / 2;
  let E, N;
  if (Math.abs(a2) > 1e-6) { E = cx / (3 * a2); N = cy / (3 * a2); }
  else { E = 0; N = 0; for (const [x, y] of ring) { E += x; N += y; } E /= ring.length; N /= ring.length; }
  return { areaM2, E, N };
}
/** ONE building or building-part block → `{ E, N, areaM2, h, roof, ring }` (native metres) or null.
 *  The regexes are the SAME ones heightSources.nrwBuildingFromBlock uses, so a probe and a bake can
 *  never disagree about what the Land said; a missing GroundSurface or height is an honest skip. */
export function partFromBlock(block) {
  const hm = block.match(/measuredHeight[^>]*>\s*([\d.]+)\s*</i);
  if (!hm) return null;
  const h = Number(hm[1]);
  if (!Number.isFinite(h) || h <= 0) return null;
  const gs = block.match(/GroundSurface[\s\S]*?<gml:posList[^>]*>([\s\S]*?)<\/gml:posList>/i);
  if (!gs) return null;
  const ring = parseNativeRing(gs[1], 3);
  if (!ring) return null;
  const { areaM2, E, N } = ringAreaCentroid(ring);
  if (!Number.isFinite(E) || !Number.isFinite(N)) return null;
  const rtCode = (block.match(/roofType[^>]*>\s*(\d+)\s*</i) ?? [])[1];
  const roof = rtCode && rtCode in DE_ROOF ? DE_ROOF[rtCode] : undefined;
  return { E, N, areaM2, h, roof, ring };
}
/**
 * ONE <bldg:Building> block → its parts. A Building that consists of <bldg:BuildingPart>s (BB, TH, RP, BE
 * — thousands of them) yields ONE part per BuildingPart, each with its OWN measuredHeight and ground ring,
 * and the enclosing Building's own geometry (if it carries both a height and a GroundSurface outside the
 * parts) as one more. This is what makes the area-weighted P90 mean the same thing here as in NRW: a
 * tall wing and a low annex are two parts with two areas, not one block whose first regex hit wins.
 */
export function partsFromBuildingBlock(block) {
  const parts = [];
  const partRe = /<bldg:BuildingPart\b[\s\S]*?<\/bldg:BuildingPart>/g;
  let remainder = block;
  const partBlocks = block.match(partRe) ?? [];
  if (partBlocks.length) {
    for (const pb of partBlocks) { const p = partFromBlock(pb); if (p) parts.push(p); }
    remainder = block.replace(partRe, '');
  }
  const own = partFromBlock(remainder);
  if (own) parts.push(own);
  return parts;
}

/**
 * A chunk-boundary-safe slicer of complete `<bldg:Building …>…</bldg:Building>` blocks from a stream of
 * text — the stateful core of streamNrwKachel, extracted so it is unit-tested. `push(text)` returns the
 * parts of every block completed by this chunk; `flush()` returns whatever a final partial chunk holds.
 * Peak memory is one block (a few KB … a few hundred KB for a big BuildingPart set), never the tile.
 */
export function createBuildingSlicer({ maxBufferChars = 32_000_000 } = {}) {
  const OPEN = '<bldg:Building ', OPEN2 = '<bldg:Building>', CLOSE = '</bldg:Building>';
  let buf = '';
  let overflow = false;
  const drain = (out) => {
    for (;;) {
      let a = buf.indexOf(OPEN);
      const a2 = buf.indexOf(OPEN2);
      if (a < 0 || (a2 >= 0 && a2 < a)) a = a2;
      if (a < 0) { if (buf.length > OPEN.length) buf = buf.slice(-OPEN.length); return; }
      const b = buf.indexOf(CLOSE, a);
      if (b < 0) { buf = buf.slice(a); return; }
      const block = buf.slice(a, b + CLOSE.length);
      buf = buf.slice(b + CLOSE.length);
      for (const p of partsFromBuildingBlock(block)) out.push(p);
    }
  };
  return {
    push(text) { const out = []; buf += text; drain(out); if (buf.length > maxBufferChars) overflow = true; return out; },
    flush() { const out = []; drain(out); buf = ''; return out; },
    get overflow() { return overflow; },
  };
}

/** Sachsen-Anhalt GeoJSON (EPSG:4326 lon,lat, HEIGHTABOVEGROUND as a string) → native UTM32 parts. */
export function stPartsFromGeojson(text, adapter = DE_LOD2_LAENDER.st) {
  let j;
  try { j = JSON.parse(text); } catch { return null; }
  if (!j || !Array.isArray(j.features)) return null;
  const parts = [];
  let skippedNoHeight = 0;
  for (const f of j.features) {
    const h = Number(f?.properties?.[adapter.heightField]);
    if (!Number.isFinite(h) || h <= 0) { skippedNoHeight++; continue; }
    const g = f.geometry;
    let ext = null;
    if (g?.type === 'Polygon') ext = g.coordinates?.[0];
    else if (g?.type === 'MultiPolygon') {
      let bestA = -1;
      for (const poly of g.coordinates ?? []) {
        const r = poly?.[0]; if (!Array.isArray(r) || r.length < 4) continue;
        let a = 0; for (let i = 0, k = r.length - 1; i < r.length; k = i++) a += r[k][0] * r[i][1] - r[i][0] * r[k][1];
        if (Math.abs(a) > bestA) { bestA = Math.abs(a); ext = r; }
      }
    }
    if (!Array.isArray(ext) || ext.length < 4) continue;
    const ring = ext.map(([lon, lat]) => wgs84ToUtm(lat, lon, adapter.zone));
    const { areaM2, E, N } = ringAreaCentroid(ring);
    if (!Number.isFinite(E) || !Number.isFinite(N)) continue;
    parts.push({ E, N, areaM2, h, roof: undefined, ring });
  }
  return { parts, skippedNoHeight, count: j.features.length };
}

// ─────────────────────────────────────────────────────────────────────────────
// §DE-LOD2-CITY-BBOXES — the `germany` national row's stamp working set (the DE analogue of
// MDS_CITY_BBOXES / MNH_FR_CITY_BBOXES / SWISS_CITY_BBOXES, mandatory for the same reason: §HEIGHT-STAMP-
// BUDGET / L-659 — a whole-country join with no bounded area holds every German footprint in the V8
// heap). ONE city per Land, the brief's list. Footprints outside these bboxes stream through with
// their original OSM tags — never a fabricated height. The `land` key is the ROUTE: a footprint inside
// a city bbox is fetched through that Land's door and no other (a Land's tile grid never crosses a
// Land border in the working set, and a city bbox is far smaller than its Land).
//
// `DE_LOD2_CITIES` lists EVERY city the brief named, wired or not, so the router table is legible in
// one place; `DE_LOD2_CITY_BBOXES` (what bake.mjs retains) is the WIRED subset only — a retained
// footprint that no door can serve would be heap for nothing.
// koln is BYTE-IDENTICAL to the bake.mjs koln row / terrain.mjs koln row (6.85,50.88,7.02,50.99).
// ─────────────────────────────────────────────────────────────────────────────
export const DE_LOD2_CITIES = [
  // city           land  [w, s, e, n] (WGS84, osmium -b order)               ≈ tiles
  { city: 'berlin',      land: 'be', bbox: [13.33, 52.48, 13.47, 52.55] },  // Mitte–Alexanderplatz–Kreuzberg · ~10×8 × 1 km (3.5 MB zips)
  { city: 'hamburg',     land: 'hh', bbox: [9.93, 53.53, 10.05, 53.58] },   // Rathaus–HafenCity–St. Pauli · ~8×6 × 1 km entries
  { city: 'potsdam',     land: 'bb', bbox: [13.02, 52.37, 13.10, 52.42] },  // ~6×6 × 1 km
  { city: 'kiel',        land: 'sh', bbox: [10.10, 54.30, 10.17, 54.35] },  // ~5×6 × 1 km (12 MB xml each)
  { city: 'erfurt',      land: 'th', bbox: [10.98, 50.95, 11.06, 51.00] },  // ~3×3 × 2 km (11 MB zips, 140 MB gml — streamed)
  { city: 'mainz',       land: 'rp', bbox: [8.22, 49.98, 8.30, 50.02] },    // ~3×3 × 2 km
  { city: 'schwerin',    land: 'mv', bbox: [11.38, 53.60, 11.45, 53.65] },  // ~3×3 × 2 km
  { city: 'magdeburg',   land: 'st', bbox: [11.60, 52.10, 11.66, 52.15] },  // ~5×6 × 1 km WFS cells
  { city: 'koln',        land: 'nw', bbox: [6.85, 50.88, 7.02, 50.99] },    // = bake.mjs koln row (182 Kacheln live-measured)
  { city: 'hannover',    land: 'ni', bbox: [9.70, 52.35, 9.78, 52.40] },    // ~6×6 × 1 km plain gml (Hannover tile 49.8 MB — streamed), S3 prefix-probed
  { city: 'munich',      land: 'by', bbox: [11.54, 48.12, 11.61, 48.16] },  // probed open, UNARMED by brief
  { city: 'dresden',     land: 'sn', bbox: [13.70, 51.03, 13.78, 51.07] },  // ~3×3 × 2 km zip (3 tiles GET 200; the share token is READ per run, never pinned)
  { city: 'stuttgart',   land: 'bw', bbox: [9.15, 48.76, 9.22, 48.80] },    // ~3×3 × 2 km zip-multi (9/9 tiles HEAD 200; odd-easting grid)
  { city: 'frankfurt',   land: 'he', bbox: [8.65, 50.10, 8.72, 50.13] },    // BLOCKED — account-gated
  { city: 'bremen',      land: 'hb', bbox: [8.78, 53.06, 8.85, 53.10] },    // UNPROBED — door not located
  { city: 'saarbruecken', land: 'sl', bbox: [6.96, 49.22, 7.02, 49.25] },   // UNPROBED — bot shield
];

export const DE_LOD2_CITY_BBOXES = DE_LOD2_CITIES
  .filter((c) => DE_LOD2_LAENDER[c.land]?.status === 'wired')
  .map((c) => ({ city: c.city, land: c.land, bbox: c.bbox }));

/** The wired city (and thus the Land adapter) whose bbox contains a WGS84 point, or null. */
export function cityForPoint(lon, lat, cities = DE_LOD2_CITY_BBOXES) {
  for (const c of cities) {
    const [w, s, e, n] = c.bbox;
    if (lon >= w && lon <= e && lat >= s && lat <= n) return c;
  }
  return null;
}

/** One line per Land — the honest router table, for logs and the result note. */
export function routerSummary(table = DE_LOD2_LAENDER) {
  return Object.entries(table).map(([cc, a]) => `${cc}=${a.status}${a.kind ? `(${a.kind}/utm${a.zone}/${a.tileM / 1000}km)` : ''}`).join(' · ');
}
