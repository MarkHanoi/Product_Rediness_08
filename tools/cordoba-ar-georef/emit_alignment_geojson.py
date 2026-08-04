"""Step 4: apply the accepted affine transform to the RED alignment polylines
and emit a GeoJSON artifact.

Only runs if georeference_fit.py produced OUTCOME == "GEOREFERENCED" for the
sheet -- refuses otherwise rather than emitting geometry under an unproven
transform.

Run:  python tools/cordoba-ar-georef/emit_alignment_geojson.py ar26
Out:  docs/04-reference/jurisdictions/es/es-an/14021-cordoba/corpus/extracted/ar26-alignment-lines.geojson
"""

from __future__ import annotations

import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "out")
DEST_DIR = os.path.join(
    HERE, "..", "..", "docs", "04-reference", "jurisdictions", "es", "es-an",
    "14021-cordoba", "corpus", "extracted",
)


def main() -> None:
    sheet = sys.argv[1] if len(sys.argv) > 1 else "ar26"

    fit_path = os.path.join(OUT, f"{sheet}_georeference_fit.json")
    with open(fit_path, encoding="utf-8") as fh:
        fit = json.load(fh)

    if fit.get("OUTCOME") != "GEOREFERENCED":
        print(f"REFUSED: {sheet} georeference_fit OUTCOME={fit.get('OUTCOME')!r}, not GEOREFERENCED.")
        print("Not emitting geometry under an unproven transform. why:", fit.get("why"))
        return

    scale = fit["accepted_scale"]
    pt_to_m = fit["affine_display_pt_to_epsg25830"]["metres_per_pdf_point"]
    # find dx, dy from the matching scale_search entry (the top-level affine
    # string is human-readable; pull the numeric dx/dy back out of the search list)
    entry = next(e for e in fit["scale_search"] if e["scale_denominator"] == scale and e["OUTCOME"] == "GEOREFERENCED")
    dx, dy = entry["dx"], entry["dy"]

    extracted_path = os.path.join(OUT, f"{sheet}_extracted.json")
    with open(extracted_path, encoding="utf-8") as fh:
        extracted = json.load(fh)

    def to_utm(pt):
        x, y = pt
        return [pt_to_m * x + dx, -pt_to_m * y + dy]

    features = []
    for i, poly in enumerate(extracted["red_polylines"]):
        coords = [to_utm(p) for p in poly["points"]]
        features.append(
            {
                "type": "Feature",
                "properties": {
                    "sheet": sheet,
                    "index": i,
                    "style_rgb_width": poly["style"],
                    "closed": poly["closed"],
                    "role_hint": (
                        "alineacion-del-vial-or-edificacion"
                        if tuple(poly["style"]) == (1.0, 0.0, 0.0, 0.84)
                        else "alineacion-red-thin-bucket"
                    ),
                    "confidence": "pipeline-extracted-unverified",
                },
                "geometry": {
                    "type": "LineString" if len(coords) >= 2 else "Point",
                    "coordinates": coords if len(coords) >= 2 else coords[0],
                },
            }
        )

    geojson = {
        "type": "FeatureCollection",
        "crs": {"type": "name", "properties": {"name": "urn:ogc:def:crs:EPSG::25830"}},
        "properties": {
            "sheet": sheet,
            "source_pdf": extracted["pdf_path"],
            "accepted_scale_denominator": scale,
            "affine": fit["affine_display_pt_to_epsg25830"],
            "georeference_fit_holdout": entry.get("holdout"),
            "georeference_fit_discrimination": entry.get("discrimination"),
            "provenance": "pipeline-extracted-unverified (offline prototype, tools/cordoba-ar-georef/)",
            "warning": (
                "NOT human-verified. NOT wired to any rule pack or runtime resolver. "
                "Red-bucket style classification (vial vs edificacion) not yet split -- "
                "both red style buckets are lumped here; see AR-EXTRACTION-PROTOTYPE findings doc."
            ),
        },
        "features": features,
    }

    os.makedirs(DEST_DIR, exist_ok=True)
    dest = os.path.join(DEST_DIR, f"{sheet}-alignment-lines.geojson")
    with open(dest, "w", encoding="utf-8") as fh:
        json.dump(geojson, fh, ensure_ascii=False)
    print(f"wrote {len(features)} features to {dest}")


if __name__ == "__main__":
    main()
