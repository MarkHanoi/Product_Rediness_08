# §ZGZ-HIDDEN — census the 25 `urbanismo:` feature types that are REACHABLE BUT UNADVERTISED.
#
# ⛔ NONE OF THESE NAMES WAS GUESSED. Every one was returned by the server itself, from WMS
#    `DescribeLayer` over the layer list in WMS GetCapabilities. The chain is:
#       published city page → WMS endpoint → GetCapabilities → DescribeLayer → typeName
#    Each link is server-authored. That is the whole methodological point: the previous attempt
#    guessed 28 names and read 28 HTTP 400s as "the city does not hold this"; in fact
#    `urbanismo:Calificaciones_Urbanas` answers 200 and always did.
#
# ⚠ AND THE CORRECTION IS NOT "ENUMERATE GetCapabilities" EITHER. WFS GetCapabilities lists 178
#   typenames and OMITS all 25 of these. A capabilities census alone would have missed the
#   subgrado exactly as badly as the sweep did. DescribeLayer is the step that closes it.

from __future__ import annotations

import io
import json
import os
import sys
from collections import Counter

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")

from ogccensus import describe_feature_type, get_feature_json, write_json  # noqa: E402

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "out")
WFS = "https://idezar-sig.zaragoza.es/servicios/geoserver/wfs"


def main() -> None:
    mapping = json.load(open(os.path.join(OUT, "zaragoza_describelayer.json"), encoding="utf-8"))
    advertised = {d["name"] for d in json.load(
        open(os.path.join(OUT, "zaragoza_wfs_layers_full.json"), encoding="utf-8"))}
    fts = sorted({f for v in mapping.values() for f in v if f.startswith("urbanismo:")})

    report = {}
    for ft in fts:
        attrs, df = describe_feature_type(WFS, ft, "2.0.0")
        doc, gf = get_feature_json(WFS, ft, count=400)
        feats = (doc or {}).get("features", [])
        vals: dict[str, Counter] = {}
        for x in feats:
            for k, v in (x.get("properties") or {}).items():
                vals.setdefault(k, Counter())[str(v)[:70]] += 1
        rec = {
            "advertised_in_wfs_capabilities": ft in advertised,
            "describe_status": df.status,
            "getfeature_status": gf.status,
            "totalFeatures": (doc or {}).get("totalFeatures"),
            "crs": ((doc or {}).get("crs") or {}).get("properties", {}).get("name"),
            "attributes": [a["name"] for a in attrs],
            "sample_values": {k: [v for v, _ in c.most_common(10)] for k, c in vals.items()},
        }
        report[ft] = rec
        flag = "listed  " if rec["advertised_in_wfs_capabilities"] else "HIDDEN  "
        print(f"\n{'='*94}\n{flag}{ft}   total={rec['totalFeatures']}  crs={rec['crs']}  "
              f"status={gf.status}")
        for k, c in vals.items():
            if k.lower() in ("geom", "the_geom", "wkb_geometry"):
                continue
            print(f"    {k:<32} -> {[v for v, _ in c.most_common(8)]}")

    write_json(os.path.join(OUT, "zaragoza_urbanismo_featuretypes.json"), report)


if __name__ == "__main__":
    main()
