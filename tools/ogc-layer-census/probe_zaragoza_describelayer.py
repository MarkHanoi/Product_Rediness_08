# §ZGZ-DESCRIBELAYER — the SERVER-SIDE enumeration of what a WMS layer is actually made of.
#
# WHY THIS STEP EXISTS. `urbanismo:Calificaciones_Urbanas` is served by the WFS and answers 200,
# yet it is ABSENT from WFS GetCapabilities. So "enumerate GetCapabilities" — the correction to
# the 28-name sweep — is itself INCOMPLETE on this deployment. A layer can be reachable and
# unlisted, which means neither guessing NOR enumerating the WFS can be trusted alone.
#
# WMS `DescribeLayer` (SLD 1.1 / WMS 1.1.1) closes it: for each WMS layer it returns the OWS
# service and the FEATURE TYPE NAME behind it — including for layer GROUPS, where it returns one
# entry per member. That is the server telling us its own composition, so nothing here is
# fabricated. It is the only enumeration that saw `Calificaciones_Urbanas` coming.
#
# Every name discovered this way is then round-tripped through WFS DescribeFeatureType +
# GetFeature so "reachable" is a measurement, not an inference.

from __future__ import annotations

import io
import json
import os
import sys
import xml.etree.ElementTree as ET
from collections import Counter

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")

from ogccensus import (  # noqa: E402
    _local, _with_params, describe_feature_type, fetch, get_feature_json, write_json,
)

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "out")
GS = "https://idezar-sig.zaragoza.es/servicios/geoserver"
WMS, WFS = f"{GS}/wms", f"{GS}/wfs"


def describe_layer(names: list[str]) -> dict[str, list[str]]:
    """WMS DescribeLayer → {wms layer: [wfs feature type, ...]}. Server-authored."""
    out: dict[str, list[str]] = {}
    CHUNK = 25
    for i in range(0, len(names), CHUNK):
        batch = names[i:i + CHUNK]
        url = _with_params(WMS, {"service": "WMS", "version": "1.1.1",
                                 "request": "DescribeLayer", "layers": ",".join(batch)})
        f = fetch(url, timeout=90)
        if not f.ok:
            print(f"  DescribeLayer batch {i//CHUNK}: status={f.status} {f.error}")
            continue
        try:
            root = ET.fromstring(f.body)
        except ET.ParseError as e:
            print(f"  DescribeLayer batch {i//CHUNK}: XML parse {e}")
            continue
        for ld in root.iter():
            if _local(ld.tag) != "LayerDescription":
                continue
            nm = ld.attrib.get("name", "")
            fts = []
            for q in ld.iter():
                if _local(q.tag) == "Query":
                    tn = q.attrib.get("typeName") or q.attrib.get("typename")
                    if tn:
                        fts.append(tn)
            if nm:
                out.setdefault(nm, []).extend(fts)
    return out


def main() -> None:
    wms_layers = json.load(open(os.path.join(OUT, "zaragoza_wms_layers_full.json"),
                                encoding="utf-8"))
    wfs_layers = json.load(open(os.path.join(OUT, "zaragoza_wfs_layers_full.json"),
                                encoding="utf-8"))
    advertised = {d["name"] for d in wfs_layers}
    names = [d["name"] for d in wms_layers]
    print(f"DescribeLayer over {len(names)} WMS layers ...")

    mapping = describe_layer(names)
    write_json(os.path.join(OUT, "zaragoza_describelayer.json"), mapping)

    all_ft: Counter = Counter()
    for wl, fts in mapping.items():
        for ft in fts:
            all_ft[ft] += 1
    print(f"\ndistinct WFS feature types behind the WMS: {len(all_ft)}")

    hidden = sorted(ft for ft in all_ft if ft not in advertised)
    print(f"\n══ {len(hidden)} FEATURE TYPES REACHABLE BUT **NOT ADVERTISED** IN WFS "
          f"GetCapabilities ══")
    print("   (this set is exactly what neither a name-sweep nor a capabilities census "
          "could find)\n")

    verified = {}
    for ft in hidden:
        attrs, df = describe_feature_type(WFS, ft, "2.0.0")
        doc, gf = get_feature_json(WFS, ft, count=1)
        total = doc.get("totalFeatures") if doc else None
        crs = ((doc or {}).get("crs") or {}).get("properties", {}).get("name")
        props = list(((doc or {}).get("features") or [{}])[0].get("properties", {}) or {})
        verified[ft] = {"describe_status": df.status, "getfeature_status": gf.status,
                        "totalFeatures": total, "crs": crs,
                        "attributes": [a["name"] for a in attrs] or props}
        mark = "OK " if total is not None else "-- "
        print(f"  {mark}{ft:<46} total={str(total):<9} crs={crs}")
        if verified[ft]["attributes"]:
            print(f"      attrs: {verified[ft]['attributes']}")

    write_json(os.path.join(OUT, "zaragoza_hidden_featuretypes.json"), verified)

    # which WMS layers are GROUPS (more than one member)
    groups = {k: v for k, v in mapping.items() if len(set(v)) > 1}
    print(f"\n══ WMS LAYER GROUPS (multi-member) — {len(groups)} ══")
    for k, v in groups.items():
        print(f"  {k}\n      -> {sorted(set(v))}")


if __name__ == "__main__":
    main()
