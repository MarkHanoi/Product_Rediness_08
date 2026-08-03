# §ZGZ-CENSUS-DEEP — DescribeFeatureType on EVERY enumerated typename, against the GLOBAL
# GeoServer endpoint (the per-workspace endpoint answers only for its own workspace, so a
# per-workspace describe silently reports "0 attributes" for 150 layers that HAVE attributes —
# exactly the failure mode this whole exercise exists to stop).
#
# Then: sample real feature VALUES from every layer whose attributes look like they could carry
# a zoning grade, because an attribute NAMED `calificacion` proves nothing until you see whether
# its values read `A1` or `A1/3.2`.

from __future__ import annotations

import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from ogccensus import (  # noqa: E402
    ES_PLANNING_TERMS, describe_feature_type, get_feature_json, match_terms, norm,
    score_layers, wfs_capabilities, wms_capabilities, write_json,
)

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "out")
GEOSERVER_ROOT = "https://idezar-sig.zaragoza.es/servicios/geoserver"
WFS_GLOBAL = f"{GEOSERVER_ROOT}/wfs"
WMS_GLOBAL = f"{GEOSERVER_ROOT}/wms"


def main() -> None:
    layers, cap = wfs_capabilities(WFS_GLOBAL, "2.0.0")
    print(f"enumerated {len(layers)} typenames from {cap.url}")

    # ⚠ describe against the GLOBAL endpoint — see header.
    for i, lay in enumerate(layers, 1):
        attrs, f = describe_feature_type(WFS_GLOBAL, lay.name, "2.0.0")
        lay.attributes = attrs
        lay.attr_error = f.error
        if i % 25 == 0:
            print(f"  described {i}/{len(layers)}")

    scored = score_layers(layers)
    write_json(os.path.join(OUT, "zaragoza_wfs_layers_full.json"), scored)

    # ── every distinct attribute NAME anywhere in the SDI, with the layers carrying it ──
    by_attr: dict[str, list[str]] = {}
    for lay in layers:
        for a in lay.attributes:
            by_attr.setdefault(a["name"], []).append(lay.name)
    write_json(os.path.join(OUT, "zaragoza_attribute_index.json"),
               {k: sorted(v) for k, v in sorted(by_attr.items())})
    print(f"\ndistinct attribute names across the whole SDI: {len(by_attr)}")

    # ── the planning-relevant subset, printed in full ──
    print("\n=== LAYERS WITH PLANNING-TERM HITS (name/title/abstract/keywords/attributes) ===")
    for d in scored:
        if d["term_hit_count"] == 0:
            continue
        print(f"\n{d['name']}  [{d['term_hit_count']} hits]  crs={','.join(d['crs'][:1])}")
        if d["title"]:
            print(f"   title:    {d['title']}")
        if d["abstract"]:
            print(f"   abstract: {d['abstract'][:200]}")
        if d["keywords"]:
            print(f"   keywords: {d['keywords']}")
        if d["metadata_urls"]:
            print(f"   metadata: {d['metadata_urls']}")
        print(f"   attrs:    {[a['name'] for a in d['attributes']]}")

    # ── WMS too: a WMS-only layer is still proof the data EXISTS ──
    wms, wcap = wms_capabilities(WMS_GLOBAL, "1.3.0")
    wms_scored = score_layers(wms)
    write_json(os.path.join(OUT, "zaragoza_wms_layers_full.json"), wms_scored)
    wfs_names = {l.name for l in layers}
    wms_only = [d for d in wms_scored if d["name"] not in wfs_names]
    print(f"\n=== WMS layers: {len(wms)} total, {len(wms_only)} NOT served by WFS ===")
    for d in wms_only:
        if d["term_hit_count"] >= 1:
            print(f"  {d['name']:<50} | {d['title'][:70]}")


if __name__ == "__main__":
    main()
