# NO fixtures — the Norwegian state's own recorded bytes (lane E7-NO, recorded 2026-09-01)

Every file here is a **verbatim response body** from a live keyless national service, saved
unmodified. They are replayed through `deps.fetchImpl` by `__tests__/noAdapter.test.ts`; nothing
in the suite reaches the network.

## Re-record

```bash
NAP="https://nap.ft.dibk.no/services/wms/reguleringsplaner"
E=-31841.977; N=6735304.036            # Bergen teig 4601-167/714 representasjonspunkt, EPSG:25833
B="$(python -c "print(f'{$E-40},{$N-40},{$E+40},{$N+40}')")"
L1="arealformal_vn1,rpomrade_vn1,hensynssoner_vn1,bestemmelsesomrader_vn1,rpregulerthoyde_vn1,rpjuridisklinje_vn1,rppaskrift_vn1"
L2="${L1//_vn1/_vn2}"

# nap-gfi-vn1-bergen-167-714.json
curl -s -o nap-gfi-vn1-bergen-167-714.json \
  "$NAP?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetFeatureInfo&LAYERS=$L1&QUERY_LAYERS=$L1&CRS=EPSG:25833&BBOX=$B&WIDTH=101&HEIGHT=101&I=50&J=50&INFO_FORMAT=application/json&FEATURE_COUNT=50"

# nap-gfi-vn2-bergen-167-714.json  (the SAME point, one vertical level up)
curl -s -o nap-gfi-vn2-bergen-167-714.json \
  "$NAP?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetFeatureInfo&LAYERS=$L2&QUERY_LAYERS=$L2&CRS=EPSG:25833&BBOX=$B&WIDTH=101&HEIGHT=101&I=50&J=50&INFO_FORMAT=application/json&FEATURE_COUNT=50"

# nap-gfi-layer-not-defined.xml    (trap T3: LayerNotDefined arrives as HTTP 200)
curl -s -o nap-gfi-layer-not-defined.xml \
  "$NAP?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetFeatureInfo&LAYERS=arealformal_vn9&QUERY_LAYERS=arealformal_vn9&CRS=EPSG:25833&BBOX=$B&WIDTH=101&HEIGHT=101&I=50&J=50&INFO_FORMAT=application/json&FEATURE_COUNT=10"

# nap-gfi-empty-wrong-crs.json     (trap T2: an unprobed CRS returns a SILENT empty)
curl -s -o nap-gfi-empty-wrong-crs.json \
  "$NAP?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetFeatureInfo&LAYERS=arealformal_vn1&QUERY_LAYERS=arealformal_vn1&CRS=EPSG:4326&BBOX=$B&WIDTH=101&HEIGHT=101&I=50&J=50&INFO_FORMAT=application/json&FEATURE_COUNT=10"

# nap-gfi-utnyttingstall-array-leak.json  (the Java-array identity leak, Bergen objid 3062)
X=593003.78; Y=8485287.16              # EPSG:3857
BL="$(python -c "print(f'{$X-40},{$Y-40},{$X+40},{$Y+40}')")"
curl -s -o nap-gfi-utnyttingstall-array-leak.json \
  "$NAP?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetFeatureInfo&LAYERS=arealformal_vn1&QUERY_LAYERS=arealformal_vn1&CRS=EPSG:3857&BBOX=$BL&WIDTH=101&HEIGHT=101&I=50&J=50&INFO_FORMAT=application/json&FEATURE_COUNT=10"

# matrikkel-teig-bergen-4601-167.xml   (3 real teiger — and numberReturned="0")
TEIG="https://wfs.geonorge.no/skwms1/wfs.matrikkelen-eiendomskart-teig"
curl -s -o matrikkel-teig-bergen-4601-167.xml \
  "$TEIG?service=WFS&version=2.0.0&request=GetFeature&typeNames=app:Teig&count=3&bbox=60.401156,5.324001,60.401556,5.324401,urn:ogc:def:crs:EPSG::4326"

# matrikkel-typename-error.xml         (HTTP 400 + ows:ExceptionReport naming the type)
curl -s -o matrikkel-typename-error.xml \
  "$TEIG?service=WFS&version=2.0.0&request=GetFeature&typeNames=app:Teigg&count=1&bbox=60.40,5.32,60.41,5.33,urn:ogc:def:crs:EPSG::4326"
```

## sha256, as recorded 2026-09-01

```
b89c4cf340cd9151e26e8914d34274c61510cd747fcc4dfd2681e49d1db909fc  matrikkel-teig-bergen-4601-167.xml
4e7015553541cc34024788f02187e34acf1e126cb33e4678207fd1b63a1face2  matrikkel-typename-error.xml
66b31bfdf076427fa831ff3cc75752b00757552108d6c561c860653b032693ac  nap-gfi-layer-not-defined.xml
32b061b39cf60b3df7f9ba205ae7291bba9ff946c3451a91ed373d4ef783f260  nap-gfi-empty-wrong-crs.json
1669cae58710447aaa47dd66aa06823636de709138dec783eafc61e28d9b0fd1  nap-gfi-utnyttingstall-array-leak.json
738a2bd32bb61db284fff2b0abc8e1ef7b6cf8447c5b05d8588ce2a54b814677  nap-gfi-vn1-bergen-167-714.json
f1823b97cbed658e4d204640820d6474f8409e653102f5cca6988b189c9630dd  nap-gfi-vn2-bergen-167-714.json
```

⚠ **THREE OF THESE SEVEN HASHES ARE NOT REPRODUCIBLE ON RE-RECORD, AND THAT IS ITSELF THE
EVIDENCE.** The suite therefore pins the hashes of the four STABLE files only, and asserts the
unstable ones on CONTENT:

* `nap-gfi-utnyttingstall-array-leak.json` — the `utnytting.utnyttingstall` value is a Java
  array **identity hash** (`[Ljava.lang.Double;@493a67bb`) that differs on every request. Three
  successive recordings of the same feature produced `@1997c7f1`, `@5faa3c69` and `@493a67bb`.
  A changing hash IS the proof that the field carries an object identity rather than data.
* `nap-gfi-empty-wrong-crs.json` and the two GFI JSON bodies carry a server `timeStamp`.
* The WMS feature `id` (`…fid-4029c24c_1a05ddb7290_-3d19`) is regenerated per request, which is
  why no minted entity id in the adapter derives from it.
