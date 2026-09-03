# HR (Croatia) parcel-leg live probes — lane HR, 2026-09-03

All probes keyless (no credential, no cookie), from this session's vantage.

## Register discovery (registri.nipp.hr — the NSDI source register, DRF JSON)
- src 1 "Digitalni katastarski plan" — uvjeti "Naknada" (FEE), format DWG, adrese geoportal.dgu.hr / katastar.hr; paired 390/391 (WMS/WFS "sporazum"=agreement), 1712 (ATOM). → the primary DKP channel is fee/agreement-gated.
- src 1712 "DKP - ATOM" — https://oss.uredjenazemlja.hr/oss/public/atom/atom_feed.xml — OPEN LICENCE (data.gov.hr otvorena-dozvola). Bulk per-KO, not a point query.
- src 1129 "Katastarske čestice i katastarske općine - WFS INSPIRE" — endpoint https://api.uredjenazemlja.hr/services/inspire/cp/wfs — register uvjeti: "uz registraciju i prihvaćanje uvjeta".
- src 248 dataset / 249 WMS — same api.uredjenazemlja.hr/services/inspire/cp_* family.

## The service (api.uredjenazemlja.hr/services/inspire) — GeoServer, keyless in practice
- cp/wfs GetCapabilities → HTTP 200, WFS 2.0.0, FTs cp:CadastralParcel + cp:CadastralZoning, DefaultCRS urn:ogc:def:crs:EPSG::3765. KEYLESS despite the register's "registration" note.
- cp/wfs DescribeFeatureType cp:CadastralParcel → 200, standard INSPIRE cp 4.0 app-schema (xsd:include CadastralParcels.xsd).
- ⛔ cp/wfs GetFeature (INSPIRE complex schema) → HTTP 400, ows:ExceptionReport "ORA-01000: maximum open cursors exceeded" on EVERY attempt incl. bare COUNT=1; 26 backoff retries over ~520 s never cleared. The app-schema→Oracle mapping saturates cursors. PERSISTENTLY DEGRADED this session, not a brief blip → the complex channel is NOT the adapter's channel.

## THE ADAPTER CHANNEL — simple-feature WFS on the cp_wms workspace (reliable, keyless)
- Endpoint: https://api.uredjenazemlja.hr/services/inspire/cp_wms/wfs
- typeName: cp_wms:CP.CadastralParcel  (simple feature, NOT the INSPIRE complex type)
- Native CRS EPSG:3765 (HTRS96/TM). A WGS84 bbox filter (BBOX=latMin,lonMin,latMax,lonMax,urn:ogc:def:crs:EPSG::4326 — lat,lon order) is honoured, server reprojects the FILTER; with no SRSNAME the OUTPUT geometry stays native 3765 (crs echoed urn:...EPSG::3765). GeoJSON coords are [E,N] in 3765 / [lon,lat] if SRSNAME=4326.
- Properties: ID (int), BROJ_CESTICE (string, the parcel number / broj čestice), MATICNI_BROJ_KO (int, cadastral-municipality code / matični broj k.o.). geometry_name=GEOMETRY.

## LIVE CLICK PROOF @ the capital (Zagreb, Ban Jelačić ~45.8132,15.9771)
GET cp_wms/wfs GetFeature TYPENAMES=cp_wms:CP.CadastralParcel COUNT=1 OUTPUTFORMAT=application/json
BBOX=45.81315,15.97705,45.81325,15.97715,urn:ogc:def:crs:EPSG::4326
→ HTTP 200, numberMatched=1, ONE Polygon (161 verts, EPSG:3765, first vert [459411.84,5074884.16]):
    ID=21609461 · BROJ_CESTICE="2379" · MATICNI_BROJ_KO=335240
= a REAL parcel: **k.č.br. 2379, k.o. CENTAR (335240), Zagreb**. (KO name from cp_wms:CP.CadastralZoning LABEL="335240-CENTAR".)
Cross-confirmed the SAME parcel via WMS GetFeatureInfo (cp_wms/wms, CP.CadastralParcel, EPSG:4326) keyless.
Recorded body: hr-zagreb-fixture.json (byte-exact live response, used as the adapter test fixture).

## Envelope-geometry channel (rules half — NOTED, not the parcel deliverable)
gis4.mgipu.hr/srv1/GradjPodrucje_MGIPU_Public/wfs — Građevinska područja (construction-area) WFS 2.0.0,
FTs Gradj_podrucje_naselje (89,911) + _izvan_naselja, EPSG:3765, keyless (census-proven 2026-09-02).
SCREENING-GRADE ONLY (register: interpretation of plans in force Sept-2020, "ne smiju [se] koristiti u
svrhu izdavanja akata"). Plan CONTENT = raster (PPRaster* county WMS); odredbe = PDF. → HR has NO
machine-readable rule pack → honest no-rule-pack path in the adapter.
