# §ZGZ-CENSUS — enumerate everything IDEZar publishes, then look for the A1 subgrado in it.
#
# ⛔ THE SEED URLS BELOW ARE NOT INVENTED. Both OGC endpoints are printed verbatim on the city's
#    own published page https://www.zaragoza.es/sede/portal/urbanismo/info-geografica/datos
#    ("Servicios OGC"), together with the four example typenames it documents. Everything else
#    this script touches is read out of a capabilities document the server itself returned, or is
#    a HOST-ROOT probe on a host the published page already named (which can only ever tell us
#    that a path is absent on a host we know exists — it cannot manufacture a host).
#
# What the previous attempt did was sweep 28 GUESSED typenames and read 28 HTTP 400s as absence.
# HTTP 400 from a WFS is "unknown typename": it is evidence about the NAME, not about the CITY.

from __future__ import annotations

import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from ogccensus import (  # noqa: E402
    ES_PLANNING_TERMS, Layer, arcgis_catalogue, describe_feature_type, fetch, get_feature_json,
    match_terms, norm, score_layers, wfs_capabilities, wms_capabilities, write_json,
)

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "out")

# ── Published on the city page, verbatim. ──
IDEZAR_HOST = "https://idezar-sig.zaragoza.es"
GEOSERVER_ROOT = f"{IDEZAR_HOST}/servicios/geoserver"
WFS_URBANISMO = f"{GEOSERVER_ROOT}/urbanismo/wfs"
WMS_URBANISMO = f"{GEOSERVER_ROOT}/urbanismo/wms"

# ── GeoServer's own GLOBAL endpoints. Not a guessed workspace: on every GeoServer these paths
#    exist by construction and return EVERY workspace's layers, which is exactly the enumeration
#    that makes per-workspace guessing unnecessary. If they 404 we learn the deployment hides
#    them — which is itself a finding, and is recorded as such.
WFS_GLOBAL = f"{GEOSERVER_ROOT}/wfs"
WMS_GLOBAL = f"{GEOSERVER_ROOT}/wms"

# The attribute the whole Zaragoza gate turns on, plus every spelling the PGOU itself uses.
SUBGRADO_TERMS = (
    "subgrado", "sub_grado", "subgrad", "grado", "gr", "subzona", "sub_zona", "subtipo",
    "calificacion", "calif", "zona", "clave", "ordenanza", "norma", "articulo", "art",
)


def main() -> None:
    report: dict = {"seeds_are_published": True, "sources": {
        "city_page": "https://www.zaragoza.es/sede/portal/urbanismo/info-geografica/datos",
    }}

    # ═══ 1. WFS GetCapabilities — THE list, not a guess. ═══
    wfs_layers: list[Layer] = []
    report["wfs"] = {}
    for label, ep in (("urbanismo", WFS_URBANISMO), ("global", WFS_GLOBAL)):
        for ver in ("2.0.0", "1.1.0"):
            lays, f = wfs_capabilities(ep, ver)
            report["wfs"][f"{label}@{ver}"] = {
                "url": f.url, "status": f.status, "error": f.error, "layer_count": len(lays),
            }
            if lays:
                wfs_layers = lays if len(lays) > len(wfs_layers) else wfs_layers
                break

    # ═══ 2. WMS GetCapabilities — a WMS-only layer still PROVES the data exists. ═══
    wms_layers: list[Layer] = []
    report["wms"] = {}
    for label, ep in (("urbanismo", WMS_URBANISMO), ("global", WMS_GLOBAL)):
        for ver in ("1.3.0", "1.1.1"):
            lays, f = wms_capabilities(ep, ver)
            report["wms"][f"{label}@{ver}"] = {
                "url": f.url, "status": f.status, "error": f.error, "layer_count": len(lays),
            }
            if lays:
                wms_layers = lays if len(lays) > len(wms_layers) else wms_layers
                break

    # ═══ 3. DescribeFeatureType on EVERY enumerated typename. ═══
    # This is the step the name-sweep could never reach: it surfaces a `subgrado` COLUMN inside a
    # layer whose name says nothing about one.
    for lay in wfs_layers:
        attrs, f = describe_feature_type(WFS_URBANISMO, lay.name, "2.0.0")
        if not attrs:
            attrs, f = describe_feature_type(WFS_URBANISMO, lay.name, "1.1.0")
        lay.attributes = attrs
        lay.attr_error = f.error

    report["wfs_layers"] = score_layers(wfs_layers)
    report["wms_layers"] = score_layers(wms_layers)

    # ═══ 4. THE SUBGRADO HUNT — across attribute names of every enumerated layer. ═══
    subgrado_hits = []
    for lay in wfs_layers:
        for a in lay.attributes:
            hits = match_terms(a["name"], SUBGRADO_TERMS)
            if hits:
                subgrado_hits.append({"layer": lay.name, "attribute": a["name"],
                                      "type": a["type"], "matched": hits})
    report["subgrado_attribute_candidates"] = subgrado_hits

    # ═══ 5. ArcGIS REST — GeoServer may not be the production backend. Host already named. ═══
    arc, arc_f = arcgis_catalogue(f"{IDEZAR_HOST}/arcgis/rest/services")
    report["arcgis"] = {
        "root": f"{IDEZAR_HOST}/arcgis/rest/services",
        "probe_status": [{"url": x.url, "status": x.status, "error": x.error} for x in arc_f[:6]],
        "layers": arc,
    }

    write_json(os.path.join(OUT, "zaragoza_ogc_census.json"), report)

    # ── console summary ──
    print(f"WFS typenames enumerated: {len(wfs_layers)}")
    for lay in wfs_layers:
        print(f"  {lay.name:<46} attrs={len(lay.attributes):<3} crs={','.join(lay.crs[:2])}")
    print(f"\nWMS layers enumerated: {len(wms_layers)}")
    for lay in wms_layers:
        print(f"  {lay.name:<46} | {lay.title[:60]}")
    print(f"\nsubgrado-ish attribute candidates: {len(subgrado_hits)}")
    for h in subgrado_hits:
        print(f"  {h['layer']}.{h['attribute']}  ({h['type']})")
    print(f"\nArcGIS layers: {len(arc)}")


if __name__ == "__main__":
    main()
